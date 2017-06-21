angular.module('brewbench-monitor')
.factory('BrewService', function($http, $q, $filter){

  return {

    //cookies size 4096 bytes
    clear: function(){
      if(window.localStorage){
        window.localStorage.removeItem('settings');
        window.localStorage.removeItem('kettles');
        window.localStorage.removeItem('urls');
      }
    },

    settings: function(key,values){
          if(!window.localStorage)
            return values;
          try {
            if(values){
              return window.localStorage.setItem(key,JSON.stringify(values));
            }
            else if(window.localStorage.getItem(key)){
              return JSON.parse(window.localStorage.getItem(key));
            }
          } catch(e){
            /*JSON parse error*/
          }
          return values;
    },

    sensorTypes: function(name){
      var sensors = [
        {name: 'Thermistor', analog: true}
        ,{name: 'DS18B20', analog: false}
        ,{name: 'PT100', analog: true}
      ];
      if(name)
        return _.filter(sensors, {'name': name})[0];
      return sensors;
    },

    kettleTypes: function(type){
      var kettles = [
        {'name':'Boil','type':'hop','target':200,'diff':5}
        ,{'name':'Mash','type':'grain','target':150,'diff':5}
        ,{'name':'Hot Liquor','type':'water','target':200,'diff':5}
        ,{'name':'Fermenter','type':'fermenter','target':74,'diff':2}
      ];
      if(type)
        return _.filter(kettles, {'type': type})[0];
      return kettles;
    },

    byteCount: function(s) {
      return encodeURI(s).split(/%..|./).length - 1;
    },

    domain: function(format){
      var settings = this.settings('settings');
      var domain = '';

      if(settings && settings.arduinoUrl)
        domain = settings.arduinoUrl.indexOf('//')===-1 ? '//'+settings.arduinoUrl : settings.arduinoUrl;
      else if(document.location.host == 'localhost')
        domain = '//arduino.local';

      if(!!format)
        return domain.indexOf('//')!==-1 ? domain.substring(domain.indexOf('//')+2) : domain;
      return domain;
    },

    slack: function(webhook_url,msg,color,icon,kettle){
      var q = $q.defer();

      var postObj = {'attachments': [{'fallback': msg,
            'title': kettle.key+' kettle',
            'title_link': 'http://'+document.location.host+'/#/arduino/'+this.domain(true),
            'fields': [{'value': msg}],
            'color': color,
            'mrkdwn_in': ['text', 'fallback', 'fields'],
            'thumb_url': icon
          }]
        };

      $http({url: webhook_url, method:'POST', data: 'payload='+JSON.stringify(postObj), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }})
        .then(function(response){
          q.resolve(response.data);
        },function(err){
          q.reject(err);
        });
      return q.promise;
    },

    // Thermistor, DS18B20, or PT100
    // https://learn.adafruit.com/thermistor/using-a-thermistor
    // https://www.adafruit.com/product/381)
    // https://www.adafruit.com/product/3290 and https://www.adafruit.com/product/3328
    temp: function(temp){
      var q = $q.defer();
      var url = this.domain()+'/arduino/'+temp.type+'/'+temp.pin;
      var settings = this.settings('settings');

      $http({url: url, method: 'GET', timeout:  settings.pollSeconds*1000})
        .then(function(response){
          if(response.headers('X-Sketch-Version') == null || response.headers('X-Sketch-Version') != settings.sketch_version)
            q.reject('Sketch Version is out of date.  Please Update. Sketch: '+response.headers('X-Sketch-Version')+' BrewBench: '+settings.sketch_version);
          else
            q.resolve(response.data);
        }, function(err){
          q.reject(err);
        });
      return q.promise;
    },
    // read/write heater
    // http://arduinotronics.blogspot.com/2013/01/working-with-sainsmart-5v-relay-board.html
    // http://myhowtosandprojects.blogspot.com/2014/02/sainsmart-2-channel-5v-relay-arduino.html
    digital: function(sensor,value){
      var q = $q.defer();
      var url = this.domain()+'/arduino/digital/'+sensor+'/'+value;
      var settings = this.settings('settings');

      $http({url: url, method: 'GET', timeout: settings.pollSeconds*1000})
        .then(function(response){
          if(response.headers('X-Sketch-Version') == null || response.headers('X-Sketch-Version') != settings.sketch_version)
            q.reject('Sketch Version is out of date.  Please Update. Sketch: '+response.headers('X-Sketch-Version')+' BrewBench: '+settings.sketch_version);
          else
            q.resolve(response.data);
        }, function(err){
          q.reject(err);
        });
      return q.promise;
    },

    digitalRead: function(sensor, timeout){
      var q = $q.defer();
      var url = this.domain()+'/arduino/digital/'+sensor;
      var settings = this.settings('settings');

      $http({url: url, method: 'GET', timeout: (timeout || settings.pollSeconds*1000)})
        .then(function(response){
          if(response.headers('X-Sketch-Version') == null || response.headers('X-Sketch-Version') != settings.sketch_version)
            q.reject('Sketch Version is out of date.  Please Update. Sketch: '+response.headers('X-Sketch-Version')+' BrewBench: '+settings.sketch_version);
          else
            q.resolve(response.data);
        }, function(err){
          q.reject(err);
        });
      return q.promise;
    },

    loadShareFile: function(file){
      var q = $q.defer();
      $http({url: 'http://monitor.brewbench.co/share/get/'+file, method: 'GET'})
        .then(function(response){
          q.resolve(response.data);
        }, function(err){
          q.reject(err);
        });
      return q.promise;
    },

    createShare: function(){
      var q = $q.defer();
      var settings = this.settings('settings');
      var kettles = this.settings('kettles');

      //remove some things we don't want to share
      _.each(kettles, (kettle, i) => {
        delete kettles[i].knob;
        delete kettles[i].values;
      });
      delete settings.notifications;
      settings.shared = true;

      $http({url: 'http://monitor.brewbench.co/share', method:'POST', data: {'settings': settings, 'kettles': kettles}, headers: { 'Content-Type': 'application/json' }})
        .then(function(response){
          q.resolve(response.data);
        }, function(err){
          q.reject(err);
        });
      return q.promise;
    },

    pkg: function(){
        var q = $q.defer();
        $http.get('/package.json').then(function(response){
          q.resolve(response.data);
        },function(err){
          q.reject(err);
        });
        return q.promise;
    },

    grains: function(){
        var q = $q.defer();
        $http.get('/assets/data/grains.json').then(function(response){
          q.resolve(response.data);
        },function(err){
          q.reject(err);
        });
        return q.promise;
    },

    hops: function(){
        var q = $q.defer();
        $http.get('/assets/data/hops.json').then(function(response){
          q.resolve(response.data);
        },function(err){
          q.reject(err);
        });
        return q.promise;
    },

    water: function(){
        var q = $q.defer();
        $http.get('/assets/data/water.json').then(function(response){
          q.resolve(response.data);
        },function(err){
          q.reject(err);
        });
        return q.promise;
    },

    lovibond: function(){
        var q = $q.defer();
        $http.get('/assets/data/lovibond.json').then(function(response){
          q.resolve(response.data);
        },function(err){
          q.reject(err);
        });
        return q.promise;
    },

    chartOptions: function(unit){
      return {
        chart: {
              type: 'lineChart',
              noData: 'Press play on a kettle to start graphing.',
              height: 350,
              margin : {
                  top: 20,
                  right: 20,
                  bottom: 100,
                  left: 65
              },
              x: function(d){ return (d && d.length) ? d[0] : d; },
              y: function(d){ return (d && d.length) ? d[1] : d; },
              // average: function(d) { return d.mean },

              color: d3.scale.category10().range(),
              duration: 300,
              useInteractiveGuideline: true,
              clipVoronoi: false,

              xAxis: {
                  axisLabel: 'Time',
                  tickFormat: function(d) {
                      return d3.time.format('%I:%M:%S')(new Date(d))
                  },
                  orient: 'bottom',
                  tickPadding: 20,
                  axisLabelDistance: 40,
                  staggerLabels: true
              },
              forceY: (!unit || unit=='F') ? [0,220] : [-17,104],
              yAxis: {
                  axisLabel: 'Temperature',
                  tickFormat: function(d){
                      return d+'\u00B0';
                  },
                  orient: 'left',
                  showMaxMin: true,
                  axisLabelDistance: 0
              }
          }
        };
    },
    // http://www.brewersfriend.com/2011/06/16/alcohol-by-volume-calculator-updated/
    // Papazian
    abv: function(og,fg){
      return (( og - fg ) * 131.25).toFixed(2);
    },
    // Daniels, used for high gravity beers
    abva: function(og,fg){
      return (( 76.08 * ( og - fg ) / ( 1.775 - og )) * ( fg / 0.794 )).toFixed(2);
    },
    // http://hbd.org/ensmingr/
    abw: function(abv,fg){
      return ((0.79 * abv) / fg).toFixed(2);
    },
    re: function(op,fp){
      return (0.1808 * op) + (0.8192 * fp);
    },
    attenuation: function(op,fp){
      return ((1 - (fp/op))*100).toFixed(2);
    },
    calories: function(abw,re,fg){
      return (((6.9 * abw) + 4.0 * (re - 0.1)) * fg * 3.55).toFixed(1);
    },
    // http://www.brewersfriend.com/plato-to-sg-conversion-chart/
    sg: function(plato){
      let sg = ( 1 + (plato / (258.6 - ( (plato/258.2) * 227.1) ) ) ).toFixed(3);
      return parseFloat(sg);
    },
    plato: function(sg){
      let plato = ((-1 * 616.868) + (1111.14 * sg) - (630.272 * Math.pow(sg,2)) + (135.997 * Math.pow(sg,3))).toString();
      if(plato.substring(plato.indexOf('.')+1,plato.indexOf('.')+2) == 5)
        plato = plato.substring(0,plato.indexOf('.')+2);
      else if(plato.substring(plato.indexOf('.')+1,plato.indexOf('.')+2) < 5)
        plato = plato.substring(0,plato.indexOf('.'));
      else if(plato.substring(plato.indexOf('.')+1,plato.indexOf('.')+2) > 5){
        plato = plato.substring(0,plato.indexOf('.'));
        plato = parseFloat(plato) + 1;
      }
      return parseFloat(plato);
    },
    recipeBeerSmith: function(recipe){
      var response = {name:'', category:'', abv:'', og:0.000, fg:0.000, hops:[], grains:[], yeast:[], misc:[]};
      if(!!recipe.F_R_NAME)
        response.name = recipe.F_R_NAME;
      if(!!recipe.F_R_STYLE.F_S_CATEGORY)
        response.category = recipe.F_R_STYLE.F_S_CATEGORY;

      if(!!recipe.F_R_STYLE.F_S_MAX_ABV)
        response.abv = $filter('number')(recipe.F_R_STYLE.F_S_MAX_ABV,2);
      else if(!!recipe.F_R_STYLE.F_S_MIN_ABV)
        response.abv = $filter('number')(recipe.F_R_STYLE.F_S_MIN_ABV,2);

      if(!!recipe.Ingredients.Data.Grain){
        _.each(recipe.Ingredients.Data.Grain,function(grain){
          response.grains.push({
            label: grain.F_G_NAME,
            min: parseInt(grain.F_G_BOIL_TIME,10),
            notes: $filter('number')(grain.F_G_AMOUNT/16,2)+' lbs.'
          });
        });
      }

      if(!!recipe.Ingredients.Data.Hops){
          _.each(recipe.Ingredients.Data.Hops,function(hop){
            response.hops.push({
              label: hop.F_H_NAME,
              min: parseInt(hop.F_H_DRY_HOP_TIME,10) > 0 ? null : parseInt(hop.F_H_BOIL_TIME,10),
              notes: parseInt(hop.F_H_DRY_HOP_TIME,10) > 0
                ? 'Dry Hop '+$filter('number')(hop.F_H_AMOUNT,2)+' oz.'+' for '+parseInt(hop.F_H_DRY_HOP_TIME,10)+' Days'
                : $filter('number')(hop.F_H_AMOUNT,2)+' oz.'
            });
            // hop.F_H_ALPHA
            // hop.F_H_DRY_HOP_TIME
          });
      }

      if(!!recipe.Ingredients.Data.Misc){
        if(recipe.Ingredients.Data.Misc.length){
          _.each(recipe.Ingredients.Data.Misc,function(misc){
            response.misc.push({
              label: misc.F_M_NAME+' '+$filter('number')(misc.F_M_AMOUNT,2),
              min: parseInt(misc.F_M_TIME,10)
            });
          });
        } else {
          response.misc.push({
            label: recipe.Ingredients.Data.Misc.F_M_NAME+' '+$filter('number')(recipe.Ingredients.Data.Misc.F_M_AMOUNT,2)+' oz.',
            min: parseInt(recipe.Ingredients.Data.Misc.F_M_TIME,10)
          });
        }
      }

      if(!!recipe.Ingredients.Data.Yeast){
        if(recipe.Ingredients.Data.Yeast.length){
          _.each(recipe.Ingredients.Data.Yeast,function(yeast){
            response.yeast.push({
              name: yeast.F_Y_LAB+' '+yeast.F_Y_PRODUCT_ID
            });
          });
        } else {
          response.yeast.push({
            name: recipe.Ingredients.Data.Yeast.F_Y_LAB+' '+recipe.Ingredients.Data.Yeast.F_Y_PRODUCT_ID
          });
        }
      }
      return response;
    },
    recipeBeerXML: function(recipe){
      var response = {name:'', category:'', abv:'', og:0.000, fg:0.000, hops:[], grains:[], yeast:[], misc:[]};
      var mash_time = 60;

      if(!!recipe.NAME)
        response.name = recipe.NAME;
      if(!!recipe.STYLE.CATEGORY)
        response.category = recipe.STYLE.CATEGORY;
      if(!!recipe.OG)
        response.og = parseFloat(recipe.OG).toFixed(3);
      if(!!recipe.FG)
        response.fg = parseFloat(recipe.FG).toFixed(3);

      if(!!recipe.STYLE.ABV_MAX)
        response.abv = $filter('number')(recipe.STYLE.ABV_MAX,2);
      else if(!!recipe.STYLE.ABV_MIN)
        response.abv = $filter('number')(recipe.STYLE.ABV_MIN,2);

      if(!!recipe.MASH.MASH_STEPS.MASH_STEP[0].STEP_TIME){
        mash_time = recipe.MASH.MASH_STEPS.MASH_STEP[0].STEP_TIME;
      }

      if(!!recipe.FERMENTABLES){
        _.each(recipe.FERMENTABLES.FERMENTABLE,function(grain){
          response.grains.push({
            label: grain.NAME,
            min: parseInt(mash_time,10),
            notes: $filter('number')(grain.AMOUNT,2)+' lbs.'
          });
        });
      }

      if(!!recipe.HOPS){
        _.each(recipe.HOPS.HOP,function(hop){
          response.hops.push({
            label: hop.NAME+' ('+hop.FORM+')',
            min: hop.USE == 'Dry Hop' ? 0 : parseInt(hop.TIME,10),
            notes: hop.USE == 'Dry Hop'
              ? hop.USE+' '+$filter('number')(hop.AMOUNT*1000/28.3495,2)+' oz.'+' for '+parseInt(hop.TIME/60/24,10)+' Days'
              : hop.USE+' '+$filter('number')(hop.AMOUNT*1000/28.3495,2)+' oz.'
          });
        });
      }

      if(!!recipe.MISCS){
        _.each(recipe.MISCS.MISC,function(misc){
          response.hops.push({
            label: misc.NAME,
            min: parseInt(hop.TIME,10),
            notes: misc.USE
          });
        });
      }

      if(!!recipe.YEASTS){
        if(recipe.YEASTS.YEAST.length){
          _.each(recipe.YEASTS.YEAST,function(yeast){
            response.yeast.push({
              name: yeast.NAME
            });
          });
        } else {
          response.yeast.push({
            name: recipe.YEASTS.YEAST.NAME
          });
        }
      }
      return response;
    },
    formatXML: function(content){
      var htmlchars = [
        {f: '&Ccedil;', r: 'Ç'},
        {f: '&ccedil;', r: 'ç'},
        {f: '&Euml;', r: 'Ë'},
        {f: '&euml;', r: 'ë'},
        {f: '&#262;', r: 'Ć'},
        {f: '&#263;', r: 'ć'},
        {f: '&#268;', r: 'Č'},
        {f: '&#269;', r: 'č'},
        {f: '&#272;', r: 'Đ'},
        {f: '&#273;', r: 'đ'},
        {f: '&#352;', r: 'Š'},
        {f: '&#353;', r: 'š'},
        {f: '&#381;', r: 'Ž'},
        {f: '&#382;', r: 'ž'},
        {f: '&Agrave;', r: 'À'},
        {f: '&agrave;', r: 'à'},
        {f: '&Ccedil;', r: 'Ç'},
        {f: '&ccedil;', r: 'ç'},
        {f: '&Egrave;', r: 'È'},
        {f: '&egrave;', r: 'è'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Iuml;', r: 'Ï'},
        {f: '&iuml;', r: 'ï'},
        {f: '&Ograve;', r: 'Ò'},
        {f: '&ograve;', r: 'ò'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&middot;', r: '·'},
        {f: '&#262;', r: 'Ć'},
        {f: '&#263;', r: 'ć'},
        {f: '&#268;', r: 'Č'},
        {f: '&#269;', r: 'č'},
        {f: '&#272;', r: 'Đ'},
        {f: '&#273;', r: 'đ'},
        {f: '&#352;', r: 'Š'},
        {f: '&#353;', r: 'š'},
        {f: '&#381;', r: 'Ž'},
        {f: '&#382;', r: 'ž'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&#268;', r: 'Č'},
        {f: '&#269;', r: 'č'},
        {f: '&#270;', r: 'Ď'},
        {f: '&#271;', r: 'ď'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&#282;', r: 'Ě'},
        {f: '&#283;', r: 'ě'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&#327;', r: 'Ň'},
        {f: '&#328;', r: 'ň'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&#344;', r: 'Ř'},
        {f: '&#345;', r: 'ř'},
        {f: '&#352;', r: 'Š'},
        {f: '&#353;', r: 'š'},
        {f: '&#356;', r: 'Ť'},
        {f: '&#357;', r: 'ť'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&#366;', r: 'Ů'},
        {f: '&#367;', r: 'ů'},
        {f: '&Yacute;', r: 'Ý'},
        {f: '&yacute;', r: 'ý'},
        {f: '&#381;', r: 'Ž'},
        {f: '&#382;', r: 'ž'},
        {f: '&AElig;', r: 'Æ'},
        {f: '&aelig;', r: 'æ'},
        {f: '&Oslash;', r: 'Ø'},
        {f: '&oslash;', r: 'ø'},
        {f: '&Aring;', r: 'Å'},
        {f: '&aring;', r: 'å'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Euml;', r: 'Ë'},
        {f: '&euml;', r: 'ë'},
        {f: '&Iuml;', r: 'Ï'},
        {f: '&iuml;', r: 'ï'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&#264;', r: 'Ĉ'},
        {f: '&#265;', r: 'ĉ'},
        {f: '&#284;', r: 'Ĝ'},
        {f: '&#285;', r: 'ĝ'},
        {f: '&#292;', r: 'Ĥ'},
        {f: '&#293;', r: 'ĥ'},
        {f: '&#308;', r: 'Ĵ'},
        {f: '&#309;', r: 'ĵ'},
        {f: '&#348;', r: 'Ŝ'},
        {f: '&#349;', r: 'ŝ'},
        {f: '&#364;', r: 'Ŭ'},
        {f: '&#365;', r: 'ŭ'},
        {f: '&Auml;', r: 'Ä'},
        {f: '&auml;', r: 'ä'},
        {f: '&Ouml;', r: 'Ö'},
        {f: '&ouml;', r: 'ö'},
        {f: '&Otilde;', r: 'Õ'},
        {f: '&otilde;', r: 'õ'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&ETH;', r: 'Ð'},
        {f: '&eth;', r: 'ð'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Yacute;', r: 'Ý'},
        {f: '&yacute;', r: 'ý'},
        {f: '&AElig;', r: 'Æ'},
        {f: '&aelig;', r: 'æ'},
        {f: '&Oslash;', r: 'Ø'},
        {f: '&oslash;', r: 'ø'},
        {f: '&Auml;', r: 'Ä'},
        {f: '&auml;', r: 'ä'},
        {f: '&Ouml;', r: 'Ö'},
        {f: '&ouml;', r: 'ö'},
        {f: '&Agrave;', r: 'À'},
        {f: '&agrave;', r: 'à'},
        {f: '&Acirc;', r: 'Â'},
        {f: '&acirc;', r: 'â'},
        {f: '&Ccedil;', r: 'Ç'},
        {f: '&ccedil;', r: 'ç'},
        {f: '&Egrave;', r: 'È'},
        {f: '&egrave;', r: 'è'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Ecirc;', r: 'Ê'},
        {f: '&ecirc;', r: 'ê'},
        {f: '&Euml;', r: 'Ë'},
        {f: '&euml;', r: 'ë'},
        {f: '&Icirc;', r: 'Î'},
        {f: '&icirc;', r: 'î'},
        {f: '&Iuml;', r: 'Ï'},
        {f: '&iuml;', r: 'ï'},
        {f: '&Ocirc;', r: 'Ô'},
        {f: '&ocirc;', r: 'ô'},
        {f: '&OElig;', r: 'Œ'},
        {f: '&oelig;', r: 'œ'},
        {f: '&Ugrave;', r: 'Ù'},
        {f: '&ugrave;', r: 'ù'},
        {f: '&Ucirc;', r: 'Û'},
        {f: '&ucirc;', r: 'û'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&#376;', r: 'Ÿ'},
        {f: '&yuml;', r: 'ÿ'},
        {f: '&Auml;', r: 'Ä'},
        {f: '&auml;', r: 'ä'},
        {f: '&Ouml;', r: 'Ö'},
        {f: '&ouml;', r: 'ö'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&szlig;', r: 'ß'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&Acirc;', r: 'Â'},
        {f: '&acirc;', r: 'â'},
        {f: '&Atilde;', r: 'Ã'},
        {f: '&atilde;', r: 'ã'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Icirc;', r: 'Î'},
        {f: '&icirc;', r: 'î'},
        {f: '&#296;', r: 'Ĩ'},
        {f: '&#297;', r: 'ĩ'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&ugrave;', r: 'ù'},
        {f: '&Ucirc;', r: 'Û'},
        {f: '&ucirc;', r: 'û'},
        {f: '&#360;', r: 'Ũ'},
        {f: '&#361;', r: 'ũ'},
        {f: '&#312;', r: 'ĸ'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Ouml;', r: 'Ö'},
        {f: '&ouml;', r: 'ö'},
        {f: '&#336;', r: 'Ő'},
        {f: '&#337;', r: 'ő'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&#368;', r: 'Ű'},
        {f: '&#369;', r: 'ű'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&ETH;', r: 'Ð'},
        {f: '&eth;', r: 'ð'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Yacute;', r: 'Ý'},
        {f: '&yacute;', r: 'ý'},
        {f: '&THORN;', r: 'Þ'},
        {f: '&thorn;', r: 'þ'},
        {f: '&AElig;', r: 'Æ'},
        {f: '&aelig;', r: 'æ'},
        {f: '&Ouml;', r: 'Ö'},
        {f: '&uml;', r: 'ö'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Agrave;', r: 'À'},
        {f: '&agrave;', r: 'à'},
        {f: '&Acirc;', r: 'Â'},
        {f: '&acirc;', r: 'â'},
        {f: '&Egrave;', r: 'È'},
        {f: '&egrave;', r: 'è'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Ecirc;', r: 'Ê'},
        {f: '&ecirc;', r: 'ê'},
        {f: '&Igrave;', r: 'Ì'},
        {f: '&igrave;', r: 'ì'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Icirc;', r: 'Î'},
        {f: '&icirc;', r: 'î'},
        {f: '&Iuml;', r: 'Ï'},
        {f: '&iuml;', r: 'ï'},
        {f: '&Ograve;', r: 'Ò'},
        {f: '&ograve;', r: 'ò'},
        {f: '&Ocirc;', r: 'Ô'},
        {f: '&ocirc;', r: 'ô'},
        {f: '&Ugrave;', r: 'Ù'},
        {f: '&ugrave;', r: 'ù'},
        {f: '&Ucirc;', r: 'Û'},
        {f: '&ucirc;', r: 'û'},
        {f: '&#256;', r: 'Ā'},
        {f: '&#257;', r: 'ā'},
        {f: '&#268;', r: 'Č'},
        {f: '&#269;', r: 'č'},
        {f: '&#274;', r: 'Ē'},
        {f: '&#275;', r: 'ē'},
        {f: '&#290;', r: 'Ģ'},
        {f: '&#291;', r: 'ģ'},
        {f: '&#298;', r: 'Ī'},
        {f: '&#299;', r: 'ī'},
        {f: '&#310;', r: 'Ķ'},
        {f: '&#311;', r: 'ķ'},
        {f: '&#315;', r: 'Ļ'},
        {f: '&#316;', r: 'ļ'},
        {f: '&#325;', r: 'Ņ'},
        {f: '&#326;', r: 'ņ'},
        {f: '&#342;', r: 'Ŗ'},
        {f: '&#343;', r: 'ŗ'},
        {f: '&#352;', r: 'Š'},
        {f: '&#353;', r: 'š'},
        {f: '&#362;', r: 'Ū'},
        {f: '&#363;', r: 'ū'},
        {f: '&#381;', r: 'Ž'},
        {f: '&#382;', r: 'ž'},
        {f: '&AElig;', r: 'Æ'},
        {f: '&aelig;', r: 'æ'},
        {f: '&Oslash;', r: 'Ø'},
        {f: '&oslash;', r: 'ø'},
        {f: '&Aring;', r: 'Å'},
        {f: '&aring;', r: 'å'},
        {f: '&#260;', r: 'Ą'},
        {f: '&#261;', r: 'ą'},
        {f: '&#262;', r: 'Ć'},
        {f: '&#263;', r: 'ć'},
        {f: '&#280;', r: 'Ę'},
        {f: '&#281;', r: 'ę'},
        {f: '&#321;', r: 'Ł'},
        {f: '&#322;', r: 'ł'},
        {f: '&#323;', r: 'Ń'},
        {f: '&#324;', r: 'ń'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&#346;', r: 'Ś'},
        {f: '&#347;', r: 'ś'},
        {f: '&#377;', r: 'Ź'},
        {f: '&#378;', r: 'ź'},
        {f: '&#379;', r: 'Ż'},
        {f: '&#380;', r: 'ż'},
        {f: '&Agrave;', r: 'À'},
        {f: '&agrave;', r: 'à'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&Acirc;', r: 'Â'},
        {f: '&acirc;', r: 'â'},
        {f: '&Atilde;', r: 'Ã'},
        {f: '&atilde;', r: 'ã'},
        {f: '&Ccedil;', r: 'Ç'},
        {f: '&ccedil;', r: 'ç'},
        {f: '&Egrave;', r: 'È'},
        {f: '&egrave;', r: 'è'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Ecirc;', r: 'Ê'},
        {f: '&ecirc;', r: 'ê'},
        {f: '&Igrave;', r: 'Ì'},
        {f: '&igrave;', r: 'ì'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Iuml;', r: 'Ï'},
        {f: '&iuml;', r: 'ï'},
        {f: '&Ograve;', r: 'Ò'},
        {f: '&ograve;', r: 'ò'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Otilde;', r: 'Õ'},
        {f: '&otilde;', r: 'õ'},
        {f: '&Ugrave;', r: 'Ù'},
        {f: '&ugrave;', r: 'ù'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&ordf;', r: 'ª'},
        {f: '&ordm;', r: 'º'},
        {f: '&#258;', r: 'Ă'},
        {f: '&#259;', r: 'ă'},
        {f: '&Acirc;', r: 'Â'},
        {f: '&acirc;', r: 'â'},
        {f: '&Icirc;', r: 'Î'},
        {f: '&icirc;', r: 'î'},
        {f: '&#350;', r: 'Ş'},
        {f: '&#351;', r: 'ş'},
        {f: '&#354;', r: 'Ţ'},
        {f: '&#355;', r: 'ţ'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&#268;', r: 'Č'},
        {f: '&#269;', r: 'č'},
        {f: '&#272;', r: 'Đ'},
        {f: '&#273;', r: 'đ'},
        {f: '&#330;', r: 'Ŋ'},
        {f: '&#331;', r: 'ŋ'},
        {f: '&#352;', r: 'Š'},
        {f: '&#353;', r: 'š'},
        {f: '&#358;', r: 'Ŧ'},
        {f: '&#359;', r: 'ŧ'},
        {f: '&#381;', r: 'Ž'},
        {f: '&#382;', r: 'ž'},
        {f: '&Agrave;', r: 'À'},
        {f: '&agrave;', r: 'à'},
        {f: '&Egrave;', r: 'È'},
        {f: '&egrave;', r: 'è'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Igrave;', r: 'Ì'},
        {f: '&igrave;', r: 'ì'},
        {f: '&Ograve;', r: 'Ò'},
        {f: '&ograve;', r: 'ò'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Ugrave;', r: 'Ù'},
        {f: '&ugrave;', r: 'ù'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&Auml;', r: 'Ä'},
        {f: '&auml;', r: 'ä'},
        {f: '&#268;', r: 'Č'},
        {f: '&#269;', r: 'č'},
        {f: '&#270;', r: 'Ď'},
        {f: '&#271;', r: 'ď'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&#313;', r: 'Ĺ'},
        {f: '&#314;', r: 'ĺ'},
        {f: '&#317;', r: 'Ľ'},
        {f: '&#318;', r: 'ľ'},
        {f: '&#327;', r: 'Ň'},
        {f: '&#328;', r: 'ň'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Ocirc;', r: 'Ô'},
        {f: '&ocirc;', r: 'ô'},
        {f: '&#340;', r: 'Ŕ'},
        {f: '&#341;', r: 'ŕ'},
        {f: '&#352;', r: 'Š'},
        {f: '&#353;', r: 'š'},
        {f: '&#356;', r: 'Ť'},
        {f: '&#357;', r: 'ť'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Yacute;', r: 'Ý'},
        {f: '&yacute;', r: 'ý'},
        {f: '&#381;', r: 'Ž'},
        {f: '&#382;', r: 'ž'},
        {f: '&#268;', r: 'Č'},
        {f: '&#269;', r: 'č'},
        {f: '&#352;', r: 'Š'},
        {f: '&#353;', r: 'š'},
        {f: '&#381;', r: 'Ž'},
        {f: '&#382;', r: 'ž'},
        {f: '&Aacute;', r: 'Á'},
        {f: '&aacute;', r: 'á'},
        {f: '&Eacute;', r: 'É'},
        {f: '&eacute;', r: 'é'},
        {f: '&Iacute;', r: 'Í'},
        {f: '&iacute;', r: 'í'},
        {f: '&Oacute;', r: 'Ó'},
        {f: '&oacute;', r: 'ó'},
        {f: '&Ntilde;', r: 'Ñ'},
        {f: '&ntilde;', r: 'ñ'},
        {f: '&Uacute;', r: 'Ú'},
        {f: '&uacute;', r: 'ú'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&iexcl;', r: '¡'},
        {f: '&ordf;', r: 'ª'},
        {f: '&iquest;', r: '¿'},
        {f: '&ordm;', r: 'º'},
        {f: '&Aring;', r: 'Å'},
        {f: '&aring;', r: 'å'},
        {f: '&Auml;', r: 'Ä'},
        {f: '&auml;', r: 'ä'},
        {f: '&Ouml;', r: 'Ö'},
        {f: '&ouml;', r: 'ö'},
        {f: '&Ccedil;', r: 'Ç'},
        {f: '&ccedil;', r: 'ç'},
        {f: '&#286;', r: 'Ğ'},
        {f: '&#287;', r: 'ğ'},
        {f: '&#304;', r: 'İ'},
        {f: '&#305;', r: 'ı'},
        {f: '&Ouml;', r: 'Ö'},
        {f: '&ouml;', r: 'ö'},
        {f: '&#350;', r: 'Ş'},
        {f: '&#351;', r: 'ş'},
        {f: '&Uuml;', r: 'Ü'},
        {f: '&uuml;', r: 'ü'},
        {f: '&euro;', r: '€'},
        {f: '&pound;', r: '£'},
        {f: '&laquo;', r: '«'},
        {f: '&raquo;', r: '»'},
        {f: '&bull;', r: '•'},
        {f: '&dagger;', r: '†'},
        {f: '&copy;', r: '©'},
        {f: '&reg;', r: '®'},
        {f: '&trade;', r: '™'},
        {f: '&deg;', r: '°'},
        {f: '&permil;', r: '‰'},
        {f: '&micro;', r: 'µ'},
        {f: '&middot;', r: '·'},
        {f: '&ndash;', r: '–'},
        {f: '&mdash;', r: '—'},
        {f: '&#8470;', r: '№'},
        {f: '&reg;', r: '®'},
        {f: '&para;', r: '¶'},
        {f: '&plusmn;', r: '±'},
        {f: '&middot;', r: '·'},
        {f: 'less-t', r: '<'},
        {f: 'greater-t', r: '>'},
        {f: '&not;', r: '¬'},
        {f: '&curren;', r: '¤'},
        {f: '&brvbar;', r: '¦'},
        {f: '&deg;', r: '°'},
        {f: '&acute;', r: '´'},
        {f: '&uml;', r: '¨'},
        {f: '&macr;', r: '¯'},
        {f: '&cedil;', r: '¸'},
        {f: '&laquo;', r: '«'},
        {f: '&raquo;', r: '»'},
        {f: '&sup1;', r: '¹'},
        {f: '&sup2;', r: '²'},
        {f: '&sup3;', r: '³'},
        {f: '&ordf;', r: 'ª'},
        {f: '&ordm;', r: 'º'},
        {f: '&iexcl;', r: '¡'},
        {f: '&iquest;', r: '¿'},
        {f: '&micro;', r: 'µ'},
        {f: 'hy;	', r: '&'},
        {f: '&ETH;', r: 'Ð'},
        {f: '&eth;', r: 'ð'},
        {f: '&Ntilde;', r: 'Ñ'},
        {f: '&ntilde;', r: 'ñ'},
        {f: '&Oslash;', r: 'Ø'},
        {f: '&oslash;', r: 'ø'},
        {f: '&szlig;', r: 'ß'},
        {f: '&amp;', r: 'and'},
        {f: '&ldquo;', r: '"'},
        {f: '&rdquo;', r: '"'},
        {f: '&rsquo;', r: "'"}
      ];

      _.each(htmlchars, function(char) {
        if(content.indexOf(char.f) !== -1){
          content = content.replace(RegExp(char.f,'g'), char.r);
        }
      });
      return content;
    }
  };
});