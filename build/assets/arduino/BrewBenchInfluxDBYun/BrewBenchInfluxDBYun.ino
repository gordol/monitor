#include <Process.h>
#include <Bridge.h>
#include <BridgeServer.h>
#include <BridgeClient.h>
// https://www.brewbench.co/libs/DHTLib.zip
#include <dht.h>
// https://www.brewbench.co/libs/cactus_io_DS18B20.zip
#include "cactus_io_DS18B20.h"

const String VERSION = "3.1.1";
const String INFLUXDB_CONNECTION = "[INFLUXDB_CONNECTION]";
const String TPLINK_CONNECTION = "[TPLINK_CONNECTION]";
const int FREQUENCY_SECONDS = [FREQUENCY_SECONDS];
int secondCounter = 0;

BridgeServer server;
dht DHT;

// https://learn.adafruit.com/thermistor/using-a-thermistor
// resistance at 25 degrees C
#define THERMISTORNOMINAL 10000
// temp. for nominal resistance (almost always 25 C)
#define TEMPERATURENOMINAL 25
// how many samples to take and average, more takes longer
// but is more 'smooth'
#define NUMSAMPLES 5
// The beta coefficient of the thermistor (usually 3000-4000)
#define BCOEFFICIENT 3950
// the value of the 'other' resistor
#define SERIESRESISTOR 10000

int samples[NUMSAMPLES];

float Thermistor(int pin) {
   uint8_t i;
   float average;

   // take N samples in a row, with a slight delay
   for (i=0; i< NUMSAMPLES; i++) {
     samples[i] = analogRead(pin);
     delay(10);
   }
   // average all the samples out
   average = 0;
   for (i=0; i< NUMSAMPLES; i++) {
      average += samples[i];
   }
   average /= NUMSAMPLES;
   // convert the value to resistance
   average = 1023 / average - 1;
   average = SERIESRESISTOR / average;

   float steinhart;
   steinhart = average / THERMISTORNOMINAL;     // (R/Ro)
   steinhart = log(steinhart);                  // ln(R/Ro)
   steinhart /= BCOEFFICIENT;                   // 1/B * ln(R/Ro)
   steinhart += 1.0 / (TEMPERATURENOMINAL + 273.15); // + (1/To)
   steinhart = 1.0 / steinhart;                 // Invert
   steinhart -= 273.15;

   return steinhart;
}

void process(BridgeClient client) {
  String command = client.readStringUntil('/');
  command.trim();

  if (command == "digital") {
    responseOkHeader(client);
    digitalCommand(client);
  }
  if (command == "analog") {
    responseOkHeader(client);
    analogCommand(client);
  }
  if (command == "DS18B20") {
    responseOkHeader(client);
    ds18B20Command(client);
  }
  if (command == "Thermistor") {
    responseOkHeader(client);
    thermistorCommand(client);
  }
  if (command == "PT100") {
    responseOkHeader(client);
    pt100Command(client);
  }
  if (command == "DHT11") {
    responseOkHeader(client);
    dht11Command(client);
  }
  if (command == "DHT21") {
    responseOkHeader(client);
    dht21Command(client);
  }
  if (command == "DHT22") {
    responseOkHeader(client);
    dht22Command(client);
  }
}

void responseOkHeader(BridgeClient client){
    client.println("Status: 200");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Access-Control-Allow-Methods: GET");
    client.println("Access-Control-Expose-Headers: X-Sketch-Version");
    client.println("X-Sketch-Version: "+VERSION);
    client.println("Content-Type: application/json");
    client.println("Connection: close");
    client.println();
}

void digitalCommand(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();
  int value;

  if (client.read() == '/') {
    //set pin as output
    pinMode(pin, OUTPUT);
    value = client.parseInt();
    if(value == 1)
      digitalWrite(pin, LOW);//turn on relay
    else
      digitalWrite(pin, HIGH);//turn off relay
  }
  else {
    value = digitalRead(pin);
  }

  // Send JSON response to client
  client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"value\":\""+String(value)+"\"}");
}

// https://www.arduino.cc/en/Reference/AnalogWrite
void analogCommand(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();
  int value;

  if (client.read() == '/') {
    pinMode(pin, OUTPUT);
    value = client.parseInt();
    analogWrite(pin, value);//0 - 255
  }
  else {
    value = analogRead(pin);
  }

  // Send JSON response to client
  client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"value\":\""+String(value)+"\"}");
}

void digitalAutoCommand(int pin, int value) {
  pinMode(pin, OUTPUT);
  if(value == 1)
    digitalWrite(pin, LOW);//turn on relay
  else if(value == 0)
    digitalWrite(pin, HIGH);//turn off relay
}

void analogAutoCommand(int pin, int value) {
  pinMode(pin, OUTPUT);
  analogWrite(pin, value);
}

// TODO figure out why this doesn't work
void tplinkAutoCommand(String deviceId, int value){
  String data = "{\"method\":\"passthrough\",\"params\":{\"deviceId\":\""+String(deviceId)+"\",\"requestData\":\"{\\\"system\\\":{\\\"set_relay_state\\\":{\\\"state\\\":"+String(value)+"}}}\"}}";
  Process p;
  // p.runShellCommand("curl -H 'Content-Type: application/json' -XPOST -d '"+data+"' --insecure '"+TPLINK_CONNECTION+"'");
  p.begin("curl");
  p.addParameter("-H");
  p.addParameter("Content-Type: application/json");
  p.addParameter("-XPOST");
  p.addParameter("-d");
  p.addParameter(data);
  p.addParameter("--insecure");
  p.addParameter(TPLINK_CONNECTION);
  p.run();
  while (p.running());
}

void ds18B20Command(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();

  DS18B20 ds(pin);
  ds.readSensor();
  float temp = ds.getTemperature_C();

  // Send JSON response to client
  client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"temp\":\""+String(temp)+"\"}");
}

float ds18B20InfluxDBCommand(String source, String pin, int adjust) {
  DS18B20 ds(pin.substring(1).toInt());
  ds.readSensor();
  float temp = ds.getTemperature_C();
  temp = temp+adjust;
  String data = "temperature,sensor=DS18B20,pin="+pin+",source="+source+" temp="+String(temp);
  Process p;
  p.begin("curl");
  p.addParameter("-XPOST");
  p.addParameter(INFLUXDB_CONNECTION);
  p.addParameter("--insecure");
  p.addParameter("--data-binary");
  p.addParameter(data);
  p.run();
  return temp;
}

void thermistorCommand(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();
  float temp = Thermistor(pin);

  // Send JSON response to client
  client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"temp\":\""+String(temp)+"\"}");
}

float thermistorInfluxDBCommand(String source, String pin, int adjust) {
  float temp = Thermistor(pin.substring(1).toInt());
  temp = temp+adjust;
  String data = "temperature,sensor=Thermistor,pin="+pin+",source="+source+" temp="+String(temp);
  Process p;
  p.begin("curl");
  p.addParameter("-XPOST");
  p.addParameter(INFLUXDB_CONNECTION);
  p.addParameter("--insecure");
  p.addParameter("--data-binary");
  p.addParameter(data);
  p.run();
  return temp;
}

// http://www.instructables.com/id/Temperature-Measurement-Tutorial-Part1/
void pt100Command(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();
  float tvoltage;
  float temp;

  if( spin == "A" )
    tvoltage = analogRead(pin);
  else
    tvoltage = digitalRead(pin);

  if (tvoltage>409){
    tvoltage = map(tvoltage,410,1023,0,614);
    temp = (150*tvoltage)/614;
  }
  // Send JSON response to client
  client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"temp\":\""+String(temp)+"\"}");
}

float pt100InfluxDBCommand(String source, String pin, int adjust) {
  float tvoltage;
  float temp;

  if( pin.substring(0,1) == "A" )
    tvoltage = analogRead(pin.substring(1).toInt());
  else
    tvoltage = digitalRead(pin.substring(1).toInt());

  if (tvoltage>409){
    tvoltage = map(tvoltage,410,1023,0,614);
    temp = (150*tvoltage)/614;
    temp = temp+adjust;
  }

  String data = "temperature,sensor=PT100,pin="+pin+",source="+source+" temp="+String(temp);
  Process p;
  p.begin("curl");
  p.addParameter("-XPOST");
  p.addParameter(INFLUXDB_CONNECTION);
  p.addParameter("--insecure");
  p.addParameter("--data-binary");
  p.addParameter(data);
  p.run();
  return temp;
}

void dht11Command(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();
  int chk = DHT.read11(pin);
  if( chk == DHTLIB_OK ){
    float temp = DHT.temperature;
    float humidity = DHT.humidity;
    // Send JSON response to client
    client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"temp\":\""+String(temp)+"\",\"humidity\":\""+String(humidity)+"\"}");
  } else {
    client.print("{\"error\":\""+String(chk)+"\"}");
  }
}

float dht11InfluxDBCommand(String source, String pin, int adjust) {
  int chk = DHT.read11(pin.substring(1).toInt());
  if( chk == DHTLIB_OK ){
    float temp = DHT.temperature+adjust;
    float humidity = DHT.humidity;
    // Send JSON response to client
    String data = "temperature,sensor=DHT11,pin="+pin+",source="+source+" temp="+String(temp)+" humidity="+String(humidity);
    Process p;
    p.begin("curl");
    p.addParameter("-XPOST");
    p.addParameter(INFLUXDB_CONNECTION);
    p.addParameter("--insecure");
    p.addParameter("--data-binary");
    p.addParameter(data);
    p.run();
    return temp;
  }
}

void dht21Command(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();
  int chk = DHT.read21(pin);
  if( chk == DHTLIB_OK ){
    float temp = DHT.temperature;
    float humidity = DHT.humidity;
    // Send JSON response to client
    client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"temp\":\""+String(temp)+"\",\"humidity\":\""+String(humidity)+"\"}");
  } else {
    client.print("{\"error\":\""+String(chk)+"\"}");
  }
}

float dht21InfluxDBCommand(String source, String pin, int adjust) {
  int chk = DHT.read21(pin.substring(1).toInt());
  if( chk == DHTLIB_OK ){
    float temp = DHT.temperature+adjust;
    float humidity = DHT.humidity;
    // Send JSON response to client
    String data = "temperature,sensor=DHT11,pin="+pin+",source="+source+" temp="+String(temp)+" humidity="+String(humidity);
    Process p;
    p.begin("curl");
    p.addParameter("-XPOST");
    p.addParameter(INFLUXDB_CONNECTION);
    p.addParameter("--insecure");
    p.addParameter("--data-binary");
    p.addParameter(data);
    p.run();
    return temp;
  }
}

void dht22Command(BridgeClient client) {
  char spin = client.read();
  int pin = client.parseInt();
  int chk = DHT.read22(pin);
  if( chk == DHTLIB_OK ){
    float temp = DHT.temperature;
    float humidity = DHT.humidity;
    // Send JSON response to client
    client.print("{\"pin\":\""+String(spin)+String(pin)+"\",\"temp\":\""+String(temp)+"\",\"humidity\":\""+String(humidity)+"\"}");
  } else {
    client.print("{\"error\":\""+String(chk)+"\"}");
  }
}

float dht22InfluxDBCommand(String source, String pin, int adjust) {
  int chk = DHT.read22(pin.substring(1).toInt());
  if( chk == DHTLIB_OK ){
    float temp = DHT.temperature+adjust;
    float humidity = DHT.humidity;
    // Send JSON response to client
    String data = "temperature,sensor=DHT22,pin="+pin+",source="+source+" temp="+String(temp)+" humidity="+String(humidity);
    Process p;
    p.begin("curl");
    p.addParameter("-XPOST");
    p.addParameter(INFLUXDB_CONNECTION);
    p.addParameter("--insecure");
    p.addParameter("--data-binary");
    p.addParameter(data);
    p.run();
    return temp;
  }
}

void trigger(String type, String source, String pin, float temp, int target, int diff) {
  String pinType = pin.substring(0,1);
  String deviceId;
  int pinNumber;
  int changeTo;
  if(pinType == "T"){ //TP Link
    deviceId = pin.substring(3);
  } else {
    pinNumber = pin.substring(1).toInt();
  }

  if(type == "heat"){
    if( temp < (target+diff) )
      changeTo = 1;
    else
      changeTo = 0;
  } else if(type == "cool"){
    if( temp > (target+diff) )
      changeTo = 1;
    else
      changeTo = 0;
  }
  if(pinType == "A")
    analogAutoCommand(pinNumber, changeTo);
  else if(pinType == "D")
    digitalAutoCommand(pinNumber, changeTo);
  else if(pinType == "T" && deviceId)
    tplinkAutoCommand(deviceId, changeTo);
}

void InfluxDB(){
  float temp;
  // [actions]
}

void setup() {

  Bridge.begin();
  // Uncomment for REST API open
  server.listenOnLocalhost();
  // Uncomment for REST API with password
  // server.noListenOnLocalhost();
  server.begin();

}

void loop() {
  BridgeClient client = server.accept();

  if (client) {
    process(client);
    client.stop();
  }
  secondCounter+=1;
  if( secondCounter == FREQUENCY_SECONDS ){
    // reset the secondCounter
    secondCounter = 0;
    InfluxDB();
  }

  delay(1000);
}