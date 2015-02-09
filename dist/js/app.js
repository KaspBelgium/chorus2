var jedOptions, t,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __slice = [].slice;

this.helpers = {};

this.config = {
  "static": {
    jsonRpcEndpoint: 'jsonrpc',
    socketsHost: location.hostname,
    socketsPort: 9090,
    ajaxTimeout: 5000,
    hashKey: 'kodi',
    defaultPlayer: 'auto',
    ignoreArticle: true,
    pollInterval: 10000,
    albumAtristsOnly: true
  }
};

this.Kodi = (function(Backbone, Marionette) {
  var App;
  App = new Backbone.Marionette.Application();
  App.addRegions({
    root: "body"
  });
  App.on("before:start", function() {
    config["static"] = _.extend(config["static"], config.get('app', 'config:local', config["static"]));
    return console.log(config["static"]);
  });
  App.vent.on("shell:ready", (function(_this) {
    return function(options) {
      return App.startHistory();
    };
  })(this));
  return App;
})(Backbone, Marionette);

$(document).ready((function(_this) {
  return function() {
    _this.Kodi.start();
    return $.material.init();
  };
})(this));


/*
  Our cache storage, persists only for app lifycle
  Eg. gets wiped when page reloaded.
 */

helpers.cache = {
  store: {},
  defaultExpiry: 406800
};

helpers.cache.set = function(key, data, expires) {
  if (expires == null) {
    expires = helpers.cache.defaultExpiry;
  }
  helpers.cache.store[key] = {
    data: data,
    expires: expires + helpers.global.time(),
    key: key
  };
  return data;
};

helpers.cache.get = function(key, fallback) {
  if (fallback == null) {
    fallback = false;
  }
  if ((helpers.cache.store[key] != null) && helpers.cache.store[key].expires >= helpers.global.time()) {
    return helpers.cache.store[key].data;
  } else {
    return fallback;
  }
};

helpers.cache.del = function(key) {
  if (helpers.cache.store[key] != null) {
    return delete helpers.cache.store[key];
  }
};

helpers.cache.clear = function() {
  return helpers.cache.store = {};
};


/*
  Config Helpers.
 */

config.get = function(type, id, defaultData, callback) {
  var data;
  if (defaultData == null) {
    defaultData = '';
  }
  data = Kodi.request("config:" + type + ":get", id, defaultData);
  if (callback != null) {
    callback(data);
  }
  return data;
};

config.set = function(type, id, data, callback) {
  var resp;
  resp = Kodi.request("config:" + type + ":set", id, data);
  if (callback != null) {
    callback(resp);
  }
  return resp;
};


/*
  Entities mixins, all the common things we do/need on almost every collection

  example of usage:

  collection = new KodiCollection()
    .setEntityType 'collection'
    .setEntityKey 'movie'
    .setEntityFields 'small', ['thumbnail', 'title']
    .setEntityFields 'full', ['fanart', 'genre']
    .setMethod 'VideoLibrary.GetMovies'
    .setArgHelper 'fields'
    .setArgHelper 'limit'
    .setArgHelper 'sort'
    .applySettings()
 */

if (this.KodiMixins == null) {
  this.KodiMixins = {};
}

KodiMixins.Entities = {
  url: config.get('static', 'jsonRpcEndpoint'),
  rpc: new Backbone.Rpc({
    useNamedParameters: true,
    namespaceDelimiter: ''
  }),

  /*
    Overrides!
   */

  /*
    Apply all the defined settings.
   */
  applySettings: function() {
    if (this.entityType === 'model') {
      return this.setModelDefaultFields();
    }
  },

  /*
    What kind of entity are we dealing with. collection or model
   */
  entityType: 'model',
  setEntityType: function(type) {
    this.entityType = type;
    return this;
  },

  /*
    Entity Keys, properties that change between the entities
   */
  entityKeys: {
    type: '',
    modelResponseProperty: '',
    collectionResponseProperty: '',
    idProperty: ''
  },
  setEntityKey: function(key, value) {
    this.entityKeys[key] = value;
    return this;
  },
  getEntityKey: function(key) {
    var ret, type;
    type = this.entityKeys.type;
    switch (key) {
      case 'modelResponseProperty':
        ret = this.entityKeys[key] != null ? this.entityKeys[key] : type + 'details';
        break;
      case 'collectionResponseProperty':
        ret = this.entityKeys[key] != null ? this.entityKeys[key] : type + 's';
        break;
      case 'idProperty':
        ret = this.entityKeys[key] != null ? this.entityKeys[key] : type + 'id';
        break;
      default:
        ret = type;
    }
    return ret;
  },

  /*
    The types of fields we request, minimal for search, small for list, full for page.
   */
  entitiyFields: {
    minimal: [],
    small: [],
    full: []
  },
  setEntityFields: function(type, fields) {
    if (fields == null) {
      fields = [];
    }
    this.entitiyFields[type] = fields;
    return this;
  },
  getEntityFields: function(type) {
    var fields;
    fields = this.entitiyFields.minimal;
    if (type === 'full') {
      return fields.concat(this.entitiyFields.small).concat(this.entitiyFields.full);
    } else if (type === 'small') {
      return fields.concat(this.entitiyFields.small);
    } else {
      return fields;
    }
  },
  modelDefaults: {
    id: 0,
    fullyloaded: false,
    thumbnail: '',
    thumbsUp: false
  },
  setModelDefaultFields: function(defaultFields) {
    var field, _i, _len, _ref, _results;
    if (defaultFields == null) {
      defaultFields = {};
    }
    defaultFields = _.extend(this.modelDefaults, defaultFields);
    _ref = this.getEntityFields('full');
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      field = _ref[_i];
      _results.push(this.defaults[field] = '');
    }
    return _results;
  },

  /*
    JsonRPC common paterns and helpers.
   */
  callMethodName: '',
  callArgs: [],
  callIgnoreArticle: true,
  setMethod: function(method) {
    this.callMethodName = method;
    return this;
  },
  setArgStatic: function(callback) {
    this.callArgs.push(callback);
    return this;
  },
  setArgHelper: function(helper, param1, param2) {
    var func;
    func = 'argHelper' + helper;
    this.callArgs.push(this[func](param1, param2));
    return this;
  },
  argCheckOption: function(option, fallback) {
    if ((this.options != null) && (this.options[option] != null)) {
      return this.options[option];
    } else {
      return fallback;
    }
  },
  argHelperfields: function(type) {
    var arg;
    if (type == null) {
      type = 'small';
    }
    arg = this.getEntityFields(type);
    return this.argCheckOption('fields', arg);
  },
  argHelpersort: function(method, order) {
    var arg;
    if (order == null) {
      order = 'ascending';
    }
    arg = {
      method: method,
      order: order,
      ignorearticle: this.callIgnoreArticle
    };
    return this.argCheckOption('sort', arg);
  },
  argHelperlimit: function(start, end) {
    var arg;
    if (start == null) {
      start = 0;
    }
    if (end == null) {
      end = 'all';
    }
    arg = {
      start: start
    };
    if (end !== 'all') {
      arg.end = end;
    }
    return this.argCheckOption('limit', arg);
  },
  argHelperfilter: function(name, value) {
    var arg;
    arg = {};
    if (name != null) {
      arg[name] = value;
    }
    return this.argCheckOption('filter', arg);
  },
  buildRpcRequest: function(type) {
    var arg, func, key, req, _i, _len, _ref;
    if (type == null) {
      type = 'read';
    }
    req = [this.callMethodName];
    _ref = this.callArgs;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      arg = _ref[_i];
      func = 'argHelper' + arg;
      if (typeof func === 'function') {
        key = 'arg' + req.length;
        req.push(key);
        this[key] = func;
      } else {
        req.push(arg);
      }
    }
    return req;
  }
};


/*
  Handle errors.
 */

helpers.debug = {
  verbose: false
};


/*
  Debug styles

  @param severity
  The severity level: info, success, warning, error
 */

helpers.debug.consoleStyle = function(severity) {
  var defaults, mods, prop, styles;
  if (severity == null) {
    severity = 'error';
  }
  defaults = {
    background: "#ccc",
    padding: "0 5px",
    color: "#444",
    "font-weight": "bold",
    "font-size": "110%"
  };
  styles = [];
  mods = {
    info: "#D8FEFE",
    success: "#CCFECD",
    warning: "#FFFDD9",
    error: "#FFCECD"
  };
  defaults.background = mods[severity];
  for (prop in defaults) {
    styles.push(prop + ": " + defaults[prop]);
  }
  return styles.join("; ");
};


/*
  Basic debug message
 */

helpers.debug.msg = function(msg, severity, data) {
  if (severity == null) {
    severity = 'info';
  }
  if (typeof console !== "undefined" && console !== null) {
    console.log("%c " + msg, helpers.debug.consoleStyle(severity));
    if (data != null) {
      return console.log(data);
    }
  }
};


/*
  Log a deubg error message.
 */

helpers.debug.log = function(msg, data, severity, caller) {
  if (data == null) {
    data = 'No data provided';
  }
  if (severity == null) {
    severity = 'error';
  }
  if (caller == null) {
    caller = arguments.callee.caller.toString();
  }
  if ((data[0] != null) && data[0].error === "Internal server error") {

  } else {
    if (typeof console !== "undefined" && console !== null) {
      console.log("%c Error in: " + msg, helpers.debug.consoleStyle(severity), data);
      if (helpers.debug.verbose && caller !== false) {
        return console.log(caller);
      }
    }
  }
};


/*
  Request Error.
 */

helpers.debug.rpcError = function(commands, data) {
  var detail, msg;
  detail = {
    called: commands
  };
  msg = '';
  if (data.error && data.error.message) {
    msg = '"' + data.error.message + '"';
    detail.error = data.error;
  } else {
    detail.error = data;
  }
  return helpers.debug.log("jsonRPC Rquequest - " + msg, detail, 'error');
};


/*
  Entity Helpers
 */

helpers.entities = {};

helpers.entities.getFields = function(set, type) {
  var fields;
  if (type == null) {
    type = 'small';
  }
  fields = set.minimal;
  if (type === 'full') {
    return fields.concat(set.small).concat(set.full);
  } else if (type === 'small') {
    return fields.concat(set.small);
  } else {
    return fields;
  }
};

helpers.entities.getSubtitle = function(model) {
  var subtitle;
  switch (model.type) {
    case 'song':
      subtitle = model.artist.join(',');
      break;
    default:
      subtitle = '';
  }
  return subtitle;
};

helpers.entities.playingLink = function(model) {
  return "<a href='#" + model.url + "'>" + model.label + "</a>";
};


/*
  Our generic global helpers so we dont have add complexity to our app.
 */

helpers.global = {};

helpers.global.shuffle = function(array) {
  var i, j, temp;
  i = array.length - 1;
  while (i > 0) {
    j = Math.floor(Math.random() * (i + 1));
    temp = array[i];
    array[i] = array[j];
    array[j] = temp;
    i--;
  }
  return array;
};

helpers.global.getRandomInt = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

helpers.global.time = function() {
  var timestamp;
  timestamp = new Date().getTime();
  return timestamp / 1000;
};

helpers.global.inArray = function(needle, haystack) {
  return _.indexOf(haystack, needle) > -1;
};

helpers.global.loading = (function(_this) {
  return function(state) {
    var op;
    if (state == null) {
      state = 'start';
    }
    op = state === 'start' ? 'add' : 'remove';
    if (_this.Kodi != null) {
      return _this.Kodi.execute("body:state", op, "loading");
    }
  };
})(this);

helpers.global.numPad = function(num, size) {
  var s;
  s = "000000000" + num;
  return s.substr(s.length - size);
};

helpers.global.secToTime = function(totalSec) {
  var hours, minutes, seconds;
  if (totalSec == null) {
    totalSec = 0;
  }
  hours = parseInt(totalSec / 3600) % 24;
  minutes = parseInt(totalSec / 60) % 60;
  seconds = totalSec % 60;
  return {
    hours: hours,
    minutes: minutes,
    seconds: seconds
  };
};

helpers.global.timeToSec = function(time) {
  var hours, minutes;
  hours = parseInt(time.hours) * (60 * 60);
  minutes = parseInt(time.minutes) * 60;
  return parseInt(hours) + parseInt(minutes) + parseInt(time.seconds);
};

helpers.global.formatTime = function(time) {
  var timeStr;
  if (time == null) {
    return 0;
  } else {
    timeStr = (time.hours > 0 ? time.hours + ":" : "") + (time.hours > 0 && time.minutes < 10 ? "0" : "") + (time.minutes > 0 ? time.minutes + ":" : "") + ((time.minutes > 0 || time.hours > 0) && time.seconds < 10 ? "0" : "") + time.seconds;
    return timeStr;
  }
};

helpers.global.paramObj = function(key, value) {
  var obj;
  obj = {};
  obj[key] = value;
  return obj;
};

helpers.global.stringStartsWith = function(start, data) {
  return new RegExp('^' + start).test(data);
};

helpers.global.stringStripStartsWith = function(start, data) {
  return data.substring(start.length);
};

helpers.global.hash = function(op, value) {
  if (op === 'encode') {
    return encodeURIComponent(value);
  } else {
    return decodeURIComponent(value);
  }
};


/*
  A collection of small jquery plugin helpers.
 */

$.fn.removeClassRegex = function(regex) {
  return $(this).removeClass(function(index, classes) {
    return classes.split(/\s+/).filter(function(c) {
      return regex.test(c);
    }).join(' ');
  });
};

$.fn.removeClassStartsWith = function(startsWith) {
  var regex;
  regex = new RegExp('^' + startsWith, 'g');
  return $(this).removeClassRegex(regex);
};


/*
  For everything translatable.
 */

jedOptions = {
  locale_data: {
    messages: {
      "": {
        domain: "messages",
        lang: "en",
        "plural_forms": "nplurals=2; plural=(n != 1);"
      }
    },
    domain: "messages"
  }
};

t = new Jed(jedOptions);


/*
  Handle urls.
 */

helpers.url = {};

helpers.url.map = {
  artist: 'music/artist/:id',
  album: 'music/album/:id',
  song: 'music/song/:id',
  movie: 'movie/:id',
  tvshow: 'tvshow/:id',
  tvseason: 'tvshow/:tvshowid/:id',
  tvepisode: 'tvshow/:tvshowid/:tvseason/:id',
  file: 'browser/file/:id',
  playlist: 'playlist/:id'
};

helpers.url.get = function(type, id, replacements) {
  var path, token;
  if (id == null) {
    id = '';
  }
  if (replacements == null) {
    replacements = {};
  }
  path = '';
  if (helpers.url.map[type] != null) {
    path = helpers.url.map[type];
  }
  replacements[':id'] = id;
  for (token in replacements) {
    id = replacements[token];
    path = path.replace(token, id);
  }
  return path;
};

helpers.url.playlistUrl = function(item) {
  if (item.type === 'song') {
    if (item.albumid !== '') {
      item.url = helpers.url.get('album', item.albumid);
    } else {
      item.url('music/albums');
    }
  }
  return item.url;
};

helpers.url.arg = function(arg) {
  var args, hash;
  if (arg == null) {
    arg = 'none';
  }
  hash = location.hash;
  args = hash.substring(1).split('/');
  if (arg === 'none') {
    return args;
  } else if (args[arg] != null) {
    return args[arg];
  } else {
    return '';
  }
};

helpers.url.params = function(params) {
  var p, path, query, _ref;
  if (params == null) {
    params = 'auto';
  }
  if (params === 'auto') {
    p = document.location.href;
    if (p.indexOf('?') === -1) {
      return {};
    } else {
      _ref = p.split('?'), path = _ref[0], query = _ref[1];
    }
  }
  if (query == null) {
    query = params;
  }
  return _.object(_.compact(_.map(query.split('&'), function(item) {
    if (item) {
      return item.split('=');
    }
  })));
};

helpers.url.buildParams = function(params) {
  var key, q, val;
  q = [];
  for (key in params) {
    val = params[key];
    q.push(key + '=' + encodeURIComponent(val));
  }
  return '?' + q.join('&');
};

helpers.url.alterParams = function(add, remove) {
  var curParams, k, params, _i, _len;
  if (add == null) {
    add = {};
  }
  if (remove == null) {
    remove = [];
  }
  curParams = helpers.url.params();
  if (remove.length > 0) {
    for (_i = 0, _len = remove.length; _i < _len; _i++) {
      k = remove[_i];
      delete curParams[k];
    }
  }
  params = _.extend(curParams, add);
  return helpers.url.path() + helpers.url.buildParams(params);
};

helpers.url.path = function() {
  var p, path, query, _ref;
  p = document.location.hash;
  _ref = p.split('?'), path = _ref[0], query = _ref[1];
  return path.substring(1);
};

Cocktail.patch(Backbone);

(function(Backbone) {
  var methods, _sync;
  _sync = Backbone.sync;
  Backbone.sync = function(method, entity, options) {
    var sync;
    if (options == null) {
      options = {};
    }
    _.defaults(options, {
      beforeSend: _.bind(methods.beforeSend, entity),
      complete: _.bind(methods.complete, entity)
    });
    sync = _sync(method, entity, options);
    if (!entity._fetch && method === "read") {
      return entity._fetch = sync;
    }
  };
  return methods = {
    beforeSend: function() {
      return this.trigger("sync:start", this);
    },
    complete: function() {
      return this.trigger("sync:stop", this);
    }
  };
})(Backbone);

(function(Backbone) {
  return _.extend(Backbone.Marionette.Application.prototype, {
    navigate: function(route, options) {
      if (options == null) {
        options = {};
      }
      return Backbone.history.navigate(route, options);
    },
    getCurrentRoute: function() {
      var frag;
      frag = Backbone.history.fragment;
      if (_.isEmpty(frag)) {
        return null;
      } else {
        return frag;
      }
    },
    startHistory: function() {
      if (Backbone.history) {
        return Backbone.history.start();
      }
    },
    register: function(instance, id) {
      if (this._registry == null) {
        this._registry = {};
      }
      return this._registry[id] = instance;
    },
    unregister: function(instance, id) {
      return delete this._registry[id];
    },
    resetRegistry: function() {
      var controller, key, msg, oldCount, _ref;
      oldCount = this.getRegistrySize();
      _ref = this._registry;
      for (key in _ref) {
        controller = _ref[key];
        controller.region.close();
      }
      msg = "There were " + oldCount + " controllers in the registry, there are now " + (this.getRegistrySize());
      if (this.getRegistrySize() > 0) {
        return console.warn(msg, this._registry);
      } else {
        return console.log(msg);
      }
    },
    getRegistrySize: function() {
      return _.size(this._registry);
    }
  });
})(Backbone);

(function(Marionette) {
  return _.extend(Marionette.Renderer, {
    extension: [".jst"],
    render: function(template, data) {
      var path;
      path = this.getTemplate(template);
      if (!path) {
        throw "Template " + template + " not found!";
      }
      return path(data);
    },
    getTemplate: function(template) {
      var path;
      path = this.insertAt(template.split("/"), -1, "tpl").join("/");
      path = path + this.extension;
      if (JST[path]) {
        return JST[path];
      }
    },
    insertAt: function(array, index, item) {
      array.splice(index, 0, item);
      return array;
    }
  });
})(Marionette);

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  return Entities.Collection = (function(_super) {
    __extends(Collection, _super);

    function Collection() {
      return Collection.__super__.constructor.apply(this, arguments);
    }

    Collection.prototype.getRawCollection = function() {
      var model, objs, _i, _len, _ref;
      objs = [];
      if (this.models.length > 0) {
        _ref = this.models;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          model = _ref[_i];
          objs.push(model.attributes);
        }
      }
      return objs;
    };

    Collection.prototype.getCacheKey = function(options) {
      var key;
      key = this.constructor.name;
      return key;
    };

    Collection.prototype.autoSort = function(params) {
      var order;
      if (params.sort) {
        order = params.order ? params.order : 'asc';
        return this.sortCollection(params.sort, order);
      }
    };

    Collection.prototype.sortCollection = function(property, order) {
      if (order == null) {
        order = 'asc';
      }
      this.comparator = (function(_this) {
        return function(model) {
          return _this.ignoreArticleParse(model.get(property));
        };
      })(this);
      if (order === 'desc') {
        this.comparator = this.reverseSortBy(this.comparator);
      }
      this.sort();
    };

    Collection.prototype.reverseSortBy = function(sortByFunction) {
      return function(left, right) {
        var l, r;
        l = sortByFunction(left);
        r = sortByFunction(right);
        if (l === void 0) {
          return -1;
        }
        if (r === void 0) {
          return 1;
        }
        if (l < r) {
          return 1;
        } else if (l > r) {
          return -1;
        } else {
          return 0;
        }
      };
    };

    Collection.prototype.ignoreArticleParse = function(string) {
      var articles, parsed, s, _i, _len;
      articles = ["'", '"', 'the ', 'a '];
      if (typeof string === 'string' && config.get('static', 'ignoreArticle', true)) {
        string = string.toLowerCase();
        parsed = false;
        for (_i = 0, _len = articles.length; _i < _len; _i++) {
          s = articles[_i];
          if (parsed) {
            continue;
          }
          if (helpers.global.stringStartsWith(s, string)) {
            string = helpers.global.stringStripStartsWith(s, string);
            parsed = true;
          }
        }
      }
      return string;
    };

    return Collection;

  })(Backbone.Collection);
});

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  return Entities.Filtered = (function(_super) {
    __extends(Filtered, _super);

    function Filtered() {
      return Filtered.__super__.constructor.apply(this, arguments);
    }

    Filtered.prototype.filterByMultiple = function(key, values) {
      if (values == null) {
        values = [];
      }
      return this.filterBy(key, function(model) {
        return helpers.global.inArray(model.get(key), values);
      });
    };

    Filtered.prototype.filterByMultipleArray = function(key, values) {
      if (values == null) {
        values = [];
      }
      return this.filterBy(key, function(model) {
        var match, v, _i, _len, _ref;
        match = false;
        _ref = model.get(key);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          v = _ref[_i];
          if (helpers.global.inArray(v, values)) {
            match = true;
          }
        }
        return match;
      });
    };

    Filtered.prototype.filterByUnwatchedShows = function() {
      return this.filterBy('unwatchedShows', function(model) {
        return model.get('unwatched') > 0;
      });
    };

    return Filtered;

  })(FilteredCollection);
});

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  return Entities.Model = (function(_super) {
    __extends(Model, _super);

    function Model() {
      this.saveError = __bind(this.saveError, this);
      this.saveSuccess = __bind(this.saveSuccess, this);
      return Model.__super__.constructor.apply(this, arguments);
    }

    Model.prototype.getCacheKey = function(options) {
      var key;
      key = this.constructor.name;
      return key;
    };

    Model.prototype.destroy = function(options) {
      if (options == null) {
        options = {};
      }
      _.defaults(options, {
        wait: true
      });
      this.set({
        _destroy: true
      });
      return Model.__super__.destroy.call(this, options);
    };

    Model.prototype.isDestroyed = function() {
      return this.get("_destroy");
    };

    Model.prototype.save = function(data, options) {
      var isNew;
      if (options == null) {
        options = {};
      }
      isNew = this.isNew();
      _.defaults(options, {
        wait: true,
        success: _.bind(this.saveSuccess, this, isNew, options.collection),
        error: _.bind(this.saveError, this)
      });
      this.unset("_errors");
      return Model.__super__.save.call(this, data, options);
    };

    Model.prototype.saveSuccess = function(isNew, collection) {
      if (isNew) {
        if (collection) {
          collection.add(this);
        }
        if (collection) {
          collection.trigger("model:created", this);
        }
        return this.trigger("created", this);
      } else {
        if (collection == null) {
          collection = this.collection;
        }
        if (collection) {
          collection.trigger("model:updated", this);
        }
        return this.trigger("updated", this);
      }
    };

    Model.prototype.saveError = function(model, xhr, options) {
      var _ref;
      if (!(xhr.status === 500 || xhr.status === 404)) {
        return this.set({
          _errors: (_ref = $.parseJSON(xhr.responseText)) != null ? _ref.errors : void 0
        });
      }
    };

    return Model;

  })(Backbone.Model);
});


/*
  App configuration settings, items stored in local storage and are
  specific to the browser/user instance. Not Kodi settings.
 */

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    storageKey: 'config:app',
    getCollection: function() {
      var collection;
      collection = new Entities.ConfigAppCollection();
      collection.fetch();
      return collection;
    },
    getConfig: function(id, collection) {
      if (collection == null) {
        collection = API.getCollection();
      }
      return collection.find({
        id: id
      });
    }
  };
  Entities.ConfigApp = (function(_super) {
    __extends(ConfigApp, _super);

    function ConfigApp() {
      return ConfigApp.__super__.constructor.apply(this, arguments);
    }

    ConfigApp.prototype.defaults = {
      data: {}
    };

    return ConfigApp;

  })(Entities.Model);
  Entities.ConfigAppCollection = (function(_super) {
    __extends(ConfigAppCollection, _super);

    function ConfigAppCollection() {
      return ConfigAppCollection.__super__.constructor.apply(this, arguments);
    }

    ConfigAppCollection.prototype.model = Entities.ConfigApp;

    ConfigAppCollection.prototype.localStorage = new Backbone.LocalStorage(API.storageKey);

    return ConfigAppCollection;

  })(Entities.Collection);
  App.reqres.setHandler("config:app:get", function(configId, defaultData) {
    var model;
    model = API.getConfig(configId);
    if (model != null) {
      return model.get('data');
    } else {
      return defaultData;
    }
  });
  App.reqres.setHandler("config:app:set", function(configId, configData) {
    var collection, model;
    collection = API.getCollection();
    model = API.getConfig(configId, collection);
    if (model != null) {
      return model.save({
        data: configData
      });
    } else {
      collection.create({
        id: configId,
        data: configData
      });
      return configData;
    }
  });
  App.reqres.setHandler("config:static:get", function(configId, defaultData) {
    var data;
    data = config["static"][configId] != null ? config["static"][configId] : defaultData;
    return data;
  });
  return App.reqres.setHandler("config:static:set", function(configId, data) {
    config["static"][configId] = data;
    return data;
  });
});

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  Entities.Filter = (function(_super) {
    __extends(Filter, _super);

    function Filter() {
      return Filter.__super__.constructor.apply(this, arguments);
    }

    Filter.prototype.defaults = {
      alias: '',
      type: 'string',
      key: '',
      sortOrder: 'asc',
      title: '',
      active: false
    };

    return Filter;

  })(Entities.Model);
  Entities.FilterCollection = (function(_super) {
    __extends(FilterCollection, _super);

    function FilterCollection() {
      return FilterCollection.__super__.constructor.apply(this, arguments);
    }

    FilterCollection.prototype.model = Entities.Filter;

    return FilterCollection;

  })(Entities.Collection);
  Entities.FilterOption = (function(_super) {
    __extends(FilterOption, _super);

    function FilterOption() {
      return FilterOption.__super__.constructor.apply(this, arguments);
    }

    FilterOption.prototype.defaults = {
      key: '',
      value: '',
      title: ''
    };

    return FilterOption;

  })(Entities.Model);
  Entities.FilterOptionCollection = (function(_super) {
    __extends(FilterOptionCollection, _super);

    function FilterOptionCollection() {
      return FilterOptionCollection.__super__.constructor.apply(this, arguments);
    }

    FilterOptionCollection.prototype.model = Entities.Filter;

    return FilterOptionCollection;

  })(Entities.Collection);
  Entities.FilterSort = (function(_super) {
    __extends(FilterSort, _super);

    function FilterSort() {
      return FilterSort.__super__.constructor.apply(this, arguments);
    }

    FilterSort.prototype.defaults = {
      alias: '',
      type: 'string',
      defaultSort: false,
      defaultOrder: 'asc',
      key: '',
      active: false,
      order: 'asc',
      title: ''
    };

    return FilterSort;

  })(Entities.Model);
  Entities.FilterSortCollection = (function(_super) {
    __extends(FilterSortCollection, _super);

    function FilterSortCollection() {
      return FilterSortCollection.__super__.constructor.apply(this, arguments);
    }

    FilterSortCollection.prototype.model = Entities.FilterSort;

    return FilterSortCollection;

  })(Entities.Collection);
  Entities.FilterActive = (function(_super) {
    __extends(FilterActive, _super);

    function FilterActive() {
      return FilterActive.__super__.constructor.apply(this, arguments);
    }

    FilterActive.prototype.defaults = {
      key: '',
      values: [],
      title: ''
    };

    return FilterActive;

  })(Entities.Model);
  Entities.FilterActiveCollection = (function(_super) {
    __extends(FilterActiveCollection, _super);

    function FilterActiveCollection() {
      return FilterActiveCollection.__super__.constructor.apply(this, arguments);
    }

    FilterActiveCollection.prototype.model = Entities.FilterActive;

    return FilterActiveCollection;

  })(Entities.Collection);
  App.reqres.setHandler('filter:filters:entities', function(collection) {
    return new Entities.FilterCollection(collection);
  });
  App.reqres.setHandler('filter:filters:options:entities', function(collection) {
    return new Entities.FilterOptionCollection(collection);
  });
  App.reqres.setHandler('filter:sort:entities', function(collection) {
    return new Entities.FilterSortCollection(collection);
  });
  return App.reqres.setHandler('filter:active:entities', function(collection) {
    return new Entities.FilterActiveCollection(collection);
  });
});

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  var API;
  Entities.FormItem = (function(_super) {
    __extends(FormItem, _super);

    function FormItem() {
      return FormItem.__super__.constructor.apply(this, arguments);
    }

    FormItem.prototype.defaults = {
      id: 0,
      title: '',
      type: '',
      element: '',
      options: [],
      defaultValue: '',
      description: '',
      children: [],
      attributes: {}
    };

    return FormItem;

  })(Entities.Model);
  Entities.Form = (function(_super) {
    __extends(Form, _super);

    function Form() {
      return Form.__super__.constructor.apply(this, arguments);
    }

    Form.prototype.model = Entities.FormItem;

    return Form;

  })(Entities.Collection);
  API = {
    applyState: function(item, formState) {
      if (formState[item.id] != null) {
        item.defaultValue = formState[item.id];
        item.defaultsApplied = true;
      }
      return item;
    },
    processItems: function(items, formState, isChild) {
      var collection, item, _i, _len;
      if (formState == null) {
        formState = {};
      }
      if (isChild == null) {
        isChild = false;
      }
      collection = [];
      for (_i = 0, _len = items.length; _i < _len; _i++) {
        item = items[_i];
        item = this.applyState(item, formState);
        if (item.children && item.children.length > 0) {
          item.children = API.processItems(item.children, formState, true);
        }
        collection.push(item);
      }
      return collection;
    },
    toCollection: function(items) {
      var childCollection, i, item;
      for (i in items) {
        item = items[i];
        if (item.children && item.children.length > 0) {
          childCollection = new Entities.Form(item.children);
          items[i].children = childCollection;
        }
      }
      return new Entities.Form(items);
    }
  };
  return App.reqres.setHandler("form:item:entites", function(form, formState) {
    if (form == null) {
      form = [];
    }
    if (formState == null) {
      formState = {};
    }
    return API.toCollection(API.processItems(form, formState));
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    cacheSynced: function(entities, callback) {
      return entities.on('cachesync', function() {
        callback();
        return helpers.global.loading("end");
      });
    },
    xhrsFetch: function(entities, callback) {
      var xhrs;
      xhrs = _.chain([entities]).flatten().pluck("_fetch").value();
      return $.when.apply($, xhrs).done(function() {
        callback();
        return helpers.global.loading("end");
      });
    }
  };
  return App.commands.setHandler("when:entity:fetched", function(entities, callback) {
    helpers.global.loading("start");
    if (!entities.params) {
      return API.cacheSynced(entities, callback);
    } else {
      return API.xhrsFetch(entities, callback);
    }
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {
  Backbone.fetchCache.localStorage = false;
  return KodiEntities.Collection = (function(_super) {
    __extends(Collection, _super);

    function Collection() {
      return Collection.__super__.constructor.apply(this, arguments);
    }

    Collection.prototype.url = config.get('static', 'jsonRpcEndpoint');

    Collection.prototype.rpc = new Backbone.Rpc({
      useNamedParameters: true,
      namespaceDelimiter: ''
    });

    Collection.prototype.sync = function(method, model, options) {
      if (method === 'read') {
        this.options = options;
      }
      return Backbone.sync(method, model, options);
    };

    Collection.prototype.getCacheKey = function(options) {
      var k, key, prop, val, _i, _len, _ref, _ref1;
      this.options = options;
      key = this.constructor.name;
      _ref = ['filter', 'sort', 'limit', 'file'];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        k = _ref[_i];
        if (options[k]) {
          _ref1 = options[k];
          for (prop in _ref1) {
            val = _ref1[prop];
            key += ':' + prop + ':' + val;
          }
        }
      }
      return key;
    };

    Collection.prototype.getResult = function(response, key) {
      var result;
      result = response.jsonrpc && response.result ? response.result : response;
      return result[key];
    };

    Collection.prototype.argCheckOption = function(option, fallback) {
      if ((this.options != null) && (this.options[option] != null)) {
        return this.options[option];
      } else {
        return fallback;
      }
    };

    Collection.prototype.argSort = function(method, order) {
      var arg;
      if (order == null) {
        order = 'ascending';
      }
      arg = {
        method: method,
        order: order,
        ignorearticle: this.isIgnoreArticle()
      };
      return this.argCheckOption('sort', arg);
    };

    Collection.prototype.argLimit = function(start, end) {
      var arg;
      if (start == null) {
        start = 0;
      }
      if (end == null) {
        end = 'all';
      }
      arg = {
        start: start
      };
      if (end !== 'all') {
        arg.end = end;
      }
      return this.argCheckOption('limit', arg);
    };

    Collection.prototype.argFilter = function(name, value) {
      var arg;
      arg = {};
      if (name != null) {
        arg[name] = value;
      }
      return this.argCheckOption('filter', arg);
    };

    Collection.prototype.isIgnoreArticle = function() {
      return config.get('static', 'ignoreArticle', true);
    };

    return Collection;

  })(App.Entities.Collection);
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {
  return KodiEntities.Model = (function(_super) {
    __extends(Model, _super);

    function Model() {
      return Model.__super__.constructor.apply(this, arguments);
    }

    Model.prototype.url = config.get('static', 'jsonRpcEndpoint');

    Model.prototype.rpc = new Backbone.Rpc({
      useNamedParameters: true,
      namespaceDelimiter: ''
    });

    Model.prototype.modelDefaults = {
      fullyloaded: false,
      thumbnail: '',
      thumbsUp: false,
      parsed: false
    };

    Model.prototype.parseModel = function(type, model, id) {
      if (!model.parsed) {
        if (id !== 'mixed') {
          model.id = id;
        }
        model = App.request("images:path:entity", model);
        model.url = helpers.url.get(type, id);
        model.type = type;
        model.parsed = true;
      }
      return model;
    };

    Model.prototype.parseFieldsToDefaults = function(fields, defaults) {
      var field, _i, _len;
      if (defaults == null) {
        defaults = {};
      }
      for (_i = 0, _len = fields.length; _i < _len; _i++) {
        field = fields[_i];
        defaults[field] = '';
      }
      return defaults;
    };

    return Model;

  })(App.Entities.Model);
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    getAlbumFields: function(type) {
      var baseFields, extraFields, fields;
      if (type == null) {
        type = 'small';
      }
      baseFields = ['thumbnail', 'playcount', 'artistid', 'artist', 'genre', 'albumlabel', 'year'];
      extraFields = ['fanart', 'style', 'mood', 'description', 'genreid', 'rating'];
      if (type === 'full') {
        fields = baseFields.concat(extraFields);
        return fields;
      } else {
        return baseFields;
      }
    },
    getAlbum: function(id, options) {
      var album;
      album = new App.KodiEntities.Album();
      album.set({
        albumid: parseInt(id),
        properties: API.getAlbumFields('full')
      });
      album.fetch(options);
      return album;
    },
    getAlbums: function(options) {
      var albums, defaultOptions;
      defaultOptions = {
        cache: true
      };
      options = _.extend(defaultOptions, options);
      albums = new KodiEntities.AlbumCollection();
      albums.fetch(options);
      return albums;
    }
  };
  KodiEntities.Album = (function(_super) {
    __extends(Album, _super);

    function Album() {
      return Album.__super__.constructor.apply(this, arguments);
    }

    Album.prototype.defaults = function() {
      var fields;
      fields = _.extend(this.modelDefaults, {
        albumid: 1,
        album: ''
      });
      return this.parseFieldsToDefaults(API.getAlbumFields('full'), fields);
    };

    Album.prototype.methods = {
      read: ['AudioLibrary.GetAlbumDetails', 'albumid', 'properties']
    };

    Album.prototype.arg2 = API.getAlbumFields('full');

    Album.prototype.parse = function(resp, xhr) {
      var obj;
      obj = resp.albumdetails != null ? resp.albumdetails : resp;
      if (resp.albumdetails != null) {
        obj.fullyloaded = true;
      }
      return this.parseModel('album', obj, obj.albumid);
    };

    return Album;

  })(App.KodiEntities.Model);
  KodiEntities.AlbumCollection = (function(_super) {
    __extends(AlbumCollection, _super);

    function AlbumCollection() {
      return AlbumCollection.__super__.constructor.apply(this, arguments);
    }

    AlbumCollection.prototype.model = KodiEntities.Album;

    AlbumCollection.prototype.methods = {
      read: ['AudioLibrary.GetAlbums', 'arg1', 'arg2', 'arg3', 'arg4']
    };

    AlbumCollection.prototype.arg1 = function() {
      return API.getAlbumFields('small');
    };

    AlbumCollection.prototype.arg2 = function() {
      return this.argLimit();
    };

    AlbumCollection.prototype.arg3 = function() {
      return this.argSort("title", "ascending");
    };

    AlbumCollection.prototype.arg3 = function() {
      return this.argFilter();
    };

    AlbumCollection.prototype.parse = function(resp, xhr) {
      return this.getResult(resp, 'albums');
    };

    return AlbumCollection;

  })(App.KodiEntities.Collection);
  App.reqres.setHandler("album:entity", function(id, options) {
    if (options == null) {
      options = {};
    }
    return API.getAlbum(id, options);
  });
  return App.reqres.setHandler("album:entities", function(options) {
    if (options == null) {
      options = {};
    }
    return API.getAlbums(options);
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    getArtistFields: function(type) {
      var baseFields, extraFields, fields;
      if (type == null) {
        type = 'small';
      }
      baseFields = ['thumbnail', 'mood', 'genre', 'style'];
      extraFields = ['fanart', 'born', 'formed', 'description'];
      if (type === 'full') {
        fields = baseFields.concat(extraFields);
        return fields;
      } else {
        return baseFields;
      }
    },
    getArtist: function(id, options) {
      var artist;
      artist = new App.KodiEntities.Artist();
      artist.set({
        artistid: parseInt(id),
        properties: API.getArtistFields('full')
      });
      artist.fetch(options);
      return artist;
    },
    getArtists: function(options) {
      var artists, defaultOptions;
      defaultOptions = {
        cache: true
      };
      options = _.extend(defaultOptions, options);
      artists = helpers.cache.get("artist:entities");
      if (artists === false || options.reset === true) {
        artists = new KodiEntities.ArtistCollection();
        artists.fetch(options);
      }
      helpers.cache.set("artist:entities", artists);
      return artists;
    }
  };
  KodiEntities.Artist = (function(_super) {
    __extends(Artist, _super);

    function Artist() {
      return Artist.__super__.constructor.apply(this, arguments);
    }

    Artist.prototype.defaults = function() {
      var fields;
      fields = _.extend(this.modelDefaults, {
        artistid: 1,
        artist: ''
      });
      return this.parseFieldsToDefaults(API.getArtistFields('full'), fields);
    };

    Artist.prototype.methods = {
      read: ['AudioLibrary.GetArtistDetails', 'artistid', 'properties']
    };

    Artist.prototype.arg2 = API.getArtistFields('full');

    Artist.prototype.parse = function(resp, xhr) {
      var obj;
      obj = resp.artistdetails != null ? resp.artistdetails : resp;
      if (resp.artistdetails != null) {
        obj.fullyloaded = true;
      }
      return this.parseModel('artist', obj, obj.artistid);
    };

    return Artist;

  })(App.KodiEntities.Model);
  KodiEntities.ArtistCollection = (function(_super) {
    __extends(ArtistCollection, _super);

    function ArtistCollection() {
      return ArtistCollection.__super__.constructor.apply(this, arguments);
    }

    ArtistCollection.prototype.model = KodiEntities.Artist;

    ArtistCollection.prototype.methods = {
      read: ['AudioLibrary.GetArtists', 'arg1', 'arg2', 'arg3', 'arg4']
    };

    ArtistCollection.prototype.arg1 = function() {
      return config.get('static', 'albumAtristsOnly', true);
    };

    ArtistCollection.prototype.arg2 = function() {
      return API.getArtistFields('small');
    };

    ArtistCollection.prototype.arg3 = function() {
      return this.argLimit();
    };

    ArtistCollection.prototype.arg4 = function() {
      return this.argSort("artist", "ascending");
    };

    ArtistCollection.prototype.parse = function(resp, xhr) {
      return this.getResult(resp, 'artists');
    };

    return ArtistCollection;

  })(App.KodiEntities.Collection);
  App.reqres.setHandler("artist:entity", function(id, options) {
    if (options == null) {
      options = {};
    }
    return API.getArtist(id, options);
  });
  return App.reqres.setHandler("artist:entities", function(options) {
    if (options == null) {
      options = {};
    }
    return API.getArtists(options);
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {

  /*
    API Helpers
   */
  var API;
  API = {
    fields: {
      minimal: ['title', 'file', 'mimetype'],
      small: ['thumbnail'],
      full: ['fanart', 'streamdetails']
    },
    addonFields: ['path', 'name'],
    sources: [
      {
        media: 'video',
        label: 'Video',
        type: 'source',
        provides: 'video'
      }, {
        media: 'music',
        label: 'Music',
        type: 'source',
        provides: 'audio'
      }, {
        media: 'music',
        label: 'Audio Addons',
        type: 'addon',
        provides: 'audio',
        addonType: 'xbmc.addon.audio',
        content: 'unknown'
      }, {
        media: 'video',
        label: 'Video Addons',
        type: 'addon',
        provides: 'files',
        addonType: 'xbmc.addon.video',
        content: 'unknown'
      }
    ],
    directorySeperator: '/',
    getEntity: function(id, options) {
      var entity;
      entity = new App.KodiEntities.File();
      entity.set({
        file: id,
        properties: helpers.entities.getFields(API.fields, 'full')
      });
      entity.fetch(options);
      return entity;
    },
    getCollection: function(type, options) {
      var collection, defaultOptions;
      defaultOptions = {
        cache: true
      };
      options = _.extend(defaultOptions, options);
      if (type === 'sources') {
        collection = new KodiEntities.SourceCollection();
      } else {
        collection = new KodiEntities.FileCollection();
      }
      collection.fetch(options);
      return collection;
    },
    parseToFilesAndFolders: function(collection) {
      var all, collections;
      all = collection.getRawCollection();
      collections = {};
      collections.file = new KodiEntities.FileCustomCollection(_.where(all, {
        filetype: 'file'
      }));
      collections.directory = new KodiEntities.FileCustomCollection(_.where(all, {
        filetype: 'directory'
      }));
      return collections;
    },
    getSources: function() {
      var collection, commander, commands, source, _i, _len, _ref;
      commander = App.request("command:kodi:controller", 'auto', 'Commander');
      commands = [];
      collection = new KodiEntities.SourceCollection();
      _ref = this.sources;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        source = _ref[_i];
        if (source.type === 'source') {
          commands.push({
            method: 'Files.GetSources',
            params: [source.media]
          });
        }
        if (source.type === 'addon') {
          commands.push({
            method: 'Addons.GetAddons',
            params: [source.addonType, source.content, true, this.addonFields]
          });
        }
      }
      commander.multipleCommands(commands, (function(_this) {
        return function(resp) {
          var i, item, model, repsonseKey, _j, _len1, _ref1;
          for (i in resp) {
            item = resp[i];
            source = _this.sources[i];
            repsonseKey = source.type + 's';
            if (item[repsonseKey]) {
              _ref1 = item[repsonseKey];
              for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
                model = _ref1[_j];
                model.media = source.media;
                model.sourcetype = source.type;
                if (source.type === 'addon') {
                  model.file = _this.createAddonFile(model);
                  model.label = model.name;
                }
                model.url = _this.createFileUrl(source.media, model.file);
                collection.add(model);
              }
            }
          }
          return collection.trigger('cachesync');
        };
      })(this));
      return collection;
    },
    parseSourceCollection: function(collection) {
      var all, items, source, _i, _len, _ref;
      all = collection.getRawCollection();
      collection = [];
      _ref = this.sources;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        source = _ref[_i];
        items = _.where(all, {
          media: source.media
        });
        if (items.length > 0 && source.type === 'source') {
          source.sources = new KodiEntities.SourceCollection(items);
          source.url = 'browser/' + source.media;
          collection.push(source);
        }
      }
      return new KodiEntities.SourceSetCollection(collection);
    },
    createFileUrl: function(media, file) {
      return 'browser/' + media + '/' + helpers.global.hash('encode', file);
    },
    createAddonFile: function(addon) {
      return 'plugin://' + addon.addonid;
    },
    parseFiles: function(items, media) {
      var i, item;
      for (i in items) {
        item = items[i];
        if (!item.parsed) {
          item = App.request("images:path:entity", item);
          items[i] = this.correctFileType(item);
          items[i].media = media;
          items[i].player = this.getPlayer(media);
          items[i].url = this.createFileUrl(media, item.file);
          items[i].parsed = true;
        }
      }
      return items;
    },
    correctFileType: function(item) {
      var directoryMimeTypes;
      directoryMimeTypes = ['x-directory/normal'];
      if (item.mimetype && helpers.global.inArray(item.mimetype, directoryMimeTypes)) {
        item.filetype = 'directory';
      }
      return item;
    },
    createPathCollection: function(file, sourcesCollection) {
      var allSources, basePath, items, parentSource, part, pathParts, source, _i, _j, _len, _len1;
      items = [];
      parentSource = {};
      allSources = sourcesCollection.getRawCollection();
      for (_i = 0, _len = allSources.length; _i < _len; _i++) {
        source = allSources[_i];
        if (parentSource.file) {
          continue;
        }
        if (helpers.global.stringStartsWith(source.file, file)) {
          parentSource = source;
        }
      }
      if (parentSource.file) {
        items.push(parentSource);
        basePath = parentSource.file;
        pathParts = helpers.global.stringStripStartsWith(parentSource.file, file).split(this.directorySeperator);
        for (_j = 0, _len1 = pathParts.length; _j < _len1; _j++) {
          part = pathParts[_j];
          if (part !== '') {
            basePath += part + this.directorySeperator;
            items.push(this.createPathModel(parentSource.media, part, basePath));
          }
        }
      }
      return new KodiEntities.FileCustomCollection(items);
    },
    createPathModel: function(media, label, file) {
      var model;
      model = {
        label: label,
        file: file,
        media: media,
        url: this.createFileUrl(media, file)
      };
      console.log(model);
      return model;
    },
    getPlayer: function(media) {
      if (media === 'music') {
        'audio';
      }
      return media;
    }
  };

  /*
   Models and collections.
   */
  KodiEntities.EmptyFile = (function(_super) {
    __extends(EmptyFile, _super);

    function EmptyFile() {
      return EmptyFile.__super__.constructor.apply(this, arguments);
    }

    EmptyFile.prototype.idAttribute = "file";

    EmptyFile.prototype.defaults = function() {
      var fields;
      fields = _.extend(this.modelDefaults, {
        filetype: 'directory',
        media: '',
        label: '',
        url: ''
      });
      return this.parseFieldsToDefaults(helpers.entities.getFields(API.fields, 'full'), fields);
    };

    return EmptyFile;

  })(App.KodiEntities.Model);
  KodiEntities.File = (function(_super) {
    __extends(File, _super);

    function File() {
      return File.__super__.constructor.apply(this, arguments);
    }

    File.prototype.methods = {
      read: ['Files.GetFileDetails', 'file', 'properties']
    };

    File.prototype.parse = function(resp, xhr) {
      var obj;
      obj = resp.filedetails != null ? resp.filedetails : resp;
      if (resp.filedetails != null) {
        obj.fullyloaded = true;
      }
      return obj;
    };

    return File;

  })(KodiEntities.EmptyFile);
  KodiEntities.FileCollection = (function(_super) {
    __extends(FileCollection, _super);

    function FileCollection() {
      return FileCollection.__super__.constructor.apply(this, arguments);
    }

    FileCollection.prototype.model = KodiEntities.File;

    FileCollection.prototype.methods = {
      read: ['Files.GetDirectory', 'arg1', 'arg2', 'arg3', 'arg4']
    };

    FileCollection.prototype.arg1 = function() {
      return this.argCheckOption('file', '');
    };

    FileCollection.prototype.arg2 = function() {
      return this.argCheckOption('media', '');
    };

    FileCollection.prototype.arg3 = function() {
      return helpers.entities.getFields(API.fields, 'small');
    };

    FileCollection.prototype.arg4 = function() {
      return this.argSort("label", "ascending");
    };

    FileCollection.prototype.parse = function(resp, xhr) {
      var items;
      items = this.getResult(resp, 'files');
      return API.parseFiles(items, this.options.media);
    };

    return FileCollection;

  })(App.KodiEntities.Collection);
  KodiEntities.FileCustomCollection = (function(_super) {
    __extends(FileCustomCollection, _super);

    function FileCustomCollection() {
      return FileCustomCollection.__super__.constructor.apply(this, arguments);
    }

    FileCustomCollection.prototype.model = KodiEntities.File;

    return FileCustomCollection;

  })(App.KodiEntities.Collection);
  KodiEntities.Source = (function(_super) {
    __extends(Source, _super);

    function Source() {
      return Source.__super__.constructor.apply(this, arguments);
    }

    Source.prototype.idAttribute = "file";

    Source.prototype.defaults = {
      label: '',
      file: '',
      media: '',
      url: ''
    };

    return Source;

  })(App.KodiEntities.Model);
  KodiEntities.SourceCollection = (function(_super) {
    __extends(SourceCollection, _super);

    function SourceCollection() {
      return SourceCollection.__super__.constructor.apply(this, arguments);
    }

    SourceCollection.prototype.model = KodiEntities.Source;

    return SourceCollection;

  })(App.KodiEntities.Collection);
  KodiEntities.SourceSet = (function(_super) {
    __extends(SourceSet, _super);

    function SourceSet() {
      return SourceSet.__super__.constructor.apply(this, arguments);
    }

    SourceSet.prototype.idAttribute = "file";

    SourceSet.prototype.defaults = {
      label: '',
      sources: ''
    };

    return SourceSet;

  })(App.KodiEntities.Model);
  KodiEntities.SourceSetCollection = (function(_super) {
    __extends(SourceSetCollection, _super);

    function SourceSetCollection() {
      return SourceSetCollection.__super__.constructor.apply(this, arguments);
    }

    SourceSetCollection.prototype.model = KodiEntities.Source;

    return SourceSetCollection;

  })(App.KodiEntities.Collection);

  /*
   Request Handlers.
   */
  App.reqres.setHandler("file:entity", function(id, options) {
    if (options == null) {
      options = {};
    }
    return API.getEntity(id, options);
  });
  App.reqres.setHandler("file:url:entity", function(media, hash) {
    var file;
    console.log(hash, decodeURIComponent(hash));
    file = helpers.global.hash('decode', hash);
    return new KodiEntities.EmptyFile({
      media: media,
      file: file,
      url: API.createFileUrl(media, file)
    });
  });
  App.reqres.setHandler("file:entities", function(options) {
    if (options == null) {
      options = {};
    }
    return API.getCollection('files', options);
  });
  App.reqres.setHandler("file:path:entities", function(file, sourceCollection) {
    return API.createPathCollection(file, sourceCollection);
  });
  App.reqres.setHandler("file:parsed:entities", function(collection) {
    return API.parseToFilesAndFolders(collection);
  });
  App.reqres.setHandler("file:source:entities", function(media) {
    return API.getSources();
  });
  App.reqres.setHandler("file:source:media:entities", function(collection) {
    return API.parseSourceCollection(collection);
  });
  return App.reqres.setHandler("file:source:mediatypes", function() {
    return API.availableSources;
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {

  /*
    API Helpers
   */
  var API;
  API = {
    fields: {
      minimal: ['title'],
      small: ['thumbnail', 'playcount', 'lastplayed', 'dateadded', 'resume', 'rating', 'year', 'file', 'genre'],
      full: ['fanart', 'plotoutline', 'studio', 'mpaa', 'cast', 'imdbnumber', 'runtime', 'streamdetails']
    },
    getEntity: function(id, options) {
      var entity;
      entity = new App.KodiEntities.Movie();
      entity.set({
        movieid: parseInt(id),
        properties: helpers.entities.getFields(API.fields, 'full')
      });
      entity.fetch(options);
      return entity;
    },
    getCollection: function(options) {
      var collection, defaultOptions;
      defaultOptions = {
        cache: true
      };
      options = _.extend(defaultOptions, options);
      collection = new KodiEntities.MovieCollection();
      collection.fetch(options);
      return collection;
    }
  };

  /*
   Models and collections.
   */
  KodiEntities.Movie = (function(_super) {
    __extends(Movie, _super);

    function Movie() {
      return Movie.__super__.constructor.apply(this, arguments);
    }

    Movie.prototype.defaults = function() {
      var fields;
      fields = _.extend(this.modelDefaults, {
        movieid: 1,
        movie: ''
      });
      return this.parseFieldsToDefaults(helpers.entities.getFields(API.fields, 'full'), fields);
    };

    Movie.prototype.methods = {
      read: ['VideoLibrary.GetMovieDetails', 'movieid', 'properties']
    };

    Movie.prototype.parse = function(resp, xhr) {
      var obj;
      obj = resp.moviedetails != null ? resp.moviedetails : resp;
      if (resp.moviedetails != null) {
        obj.fullyloaded = true;
      }
      return this.parseModel('movie', obj, obj.movieid);
    };

    return Movie;

  })(App.KodiEntities.Model);
  KodiEntities.MovieCollection = (function(_super) {
    __extends(MovieCollection, _super);

    function MovieCollection() {
      return MovieCollection.__super__.constructor.apply(this, arguments);
    }

    MovieCollection.prototype.model = KodiEntities.Movie;

    MovieCollection.prototype.methods = {
      read: ['VideoLibrary.GetMovies', 'arg1', 'arg2', 'arg3']
    };

    MovieCollection.prototype.arg1 = function() {
      return helpers.entities.getFields(API.fields, 'small');
    };

    MovieCollection.prototype.arg2 = function() {
      return this.argLimit();
    };

    MovieCollection.prototype.arg3 = function() {
      return this.argSort("title", "ascending");
    };

    MovieCollection.prototype.parse = function(resp, xhr) {
      return this.getResult(resp, 'movies');
    };

    return MovieCollection;

  })(App.KodiEntities.Collection);
  KodiEntities.MovieFilteredCollection = (function(_super) {
    __extends(MovieFilteredCollection, _super);

    function MovieFilteredCollection() {
      return MovieFilteredCollection.__super__.constructor.apply(this, arguments);
    }

    MovieFilteredCollection.prototype.methods = {
      read: ['VideoLibrary.GetMovies', 'arg1', 'arg2', 'arg3', 'arg4']
    };

    MovieFilteredCollection.prototype.arg4 = function() {
      return this.argFilter();
    };

    return MovieFilteredCollection;

  })(KodiEntities.MovieCollection);

  /*
   Request Handlers.
   */
  App.reqres.setHandler("movie:entity", function(id, options) {
    if (options == null) {
      options = {};
    }
    return API.getEntity(id, options);
  });
  return App.reqres.setHandler("movie:entities", function(options) {
    if (options == null) {
      options = {};
    }
    return API.getCollection(options);
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {

  /*
    API Helpers
   */
  var API;
  API = {
    fields: {
      minimal: ['title', 'thumbnail', 'file'],
      small: ['artist', 'genre', 'year', 'rating', 'album', 'track', 'duration', 'playcount', 'dateadded', 'episode', 'artistid', 'albumid', 'tvshowid'],
      full: ['fanart']
    },
    getCollection: function(options) {
      var collection, defaultOptions;
      defaultOptions = {
        cache: false
      };
      options = _.extend(defaultOptions, options);
      collection = new KodiEntities.PlaylistCollection();
      collection.fetch(options);
      return collection;
    },
    getType: function(item, media) {
      var type;
      type = 'file';
      if (item.id !== '') {
        if (media === 'audio') {
          type = 'song';
        } else if (media === 'video') {
          if (item.episode !== '') {
            type = 'episode';
          } else {
            type = 'movie';
          }
        }
      }
      return type;
    },
    parseItems: function(items, options) {
      var i, item;
      for (i in items) {
        item = items[i];
        item.position = parseInt(i);
        items[i] = this.parseItem(item, options);
      }
      return items;
    },
    parseItem: function(item, options) {
      item.playlistid = options.playlistid;
      item.media = options.media;
      item.player = 'kodi';
      if (!item.type) {
        item.type = API.getType(items, options.media);
      }
      if (item.type === 'file') {
        item.id = 'mixed';
      }
      return item;
    }
  };

  /*
   Models and collections.
   */
  KodiEntities.PlaylistItem = (function(_super) {
    __extends(PlaylistItem, _super);

    function PlaylistItem() {
      return PlaylistItem.__super__.constructor.apply(this, arguments);
    }

    PlaylistItem.prototype.idAttribute = "position";

    PlaylistItem.prototype.defaults = function() {
      var fields;
      fields = _.extend(this.modelDefaults, {
        position: 0
      });
      return this.parseFieldsToDefaults(helpers.entities.getFields(API.fields, 'full'), fields);
    };

    PlaylistItem.prototype.parse = function(resp, xhr) {
      var model;
      resp.fullyloaded = true;
      model = this.parseModel(resp.type, resp, resp.id);
      model.url = helpers.url.playlistUrl(model);
      return model;
    };

    return PlaylistItem;

  })(App.KodiEntities.Model);
  KodiEntities.PlaylistCollection = (function(_super) {
    __extends(PlaylistCollection, _super);

    function PlaylistCollection() {
      return PlaylistCollection.__super__.constructor.apply(this, arguments);
    }

    PlaylistCollection.prototype.model = KodiEntities.PlaylistItem;

    PlaylistCollection.prototype.methods = {
      read: ['Playlist.GetItems', 'arg1', 'arg2', 'arg3']
    };

    PlaylistCollection.prototype.arg1 = function() {
      return this.argCheckOption('playlistid', 0);
    };

    PlaylistCollection.prototype.arg2 = function() {
      return helpers.entities.getFields(API.fields, 'small');
    };

    PlaylistCollection.prototype.arg3 = function() {
      return this.argLimit();
    };

    PlaylistCollection.prototype.arg4 = function() {
      return this.argSort("position", "ascending");
    };

    PlaylistCollection.prototype.parse = function(resp, xhr) {
      var items;
      items = this.getResult(resp, 'items');
      return API.parseItems(items, this.options);
    };

    return PlaylistCollection;

  })(App.KodiEntities.Collection);

  /*
   Request Handlers.
   */
  App.reqres.setHandler("playlist:kodi:entities", function(media) {
    var collection, options, playlist;
    if (media == null) {
      media = 'audio';
    }
    playlist = App.request("command:kodi:controller", media, 'PlayList');
    options = {};
    options.media = media;
    options.playlistid = playlist.getPlayer();
    collection = API.getCollection(options);
    collection.sortCollection('position', 'asc');
    return collection;
  });
  return App.reqres.setHandler("playlist:kodi:entity:api", function() {
    return API;
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    fields: {
      minimal: ['title', 'file'],
      small: ['thumbnail', 'artist', 'artistid', 'album', 'albumid', 'lastplayed', 'track', 'year', 'duration'],
      full: ['fanart', 'genre', 'style', 'mood', 'born', 'formed', 'description', 'lyrics']
    },
    getSong: function(id, options) {
      var artist;
      artist = new App.KodiEntities.Song();
      artist.set({
        songid: parseInt(id),
        properties: helpers.entities.getFields(API.fields, 'full')
      });
      artist.fetch(options);
      return artist;
    },
    getFilteredSongs: function(options) {
      var defaultOptions, songs;
      defaultOptions = {
        cache: true
      };
      options = _.extend(defaultOptions, options);
      songs = new KodiEntities.SongFilteredCollection();
      songs.fetch(options);
      return songs;
    },
    parseSongsToAlbumSongs: function(songs) {
      var albumid, collections, parsedRaw, song, songSet, songsRaw, _i, _len;
      songsRaw = songs.getRawCollection();
      parsedRaw = {};
      collections = {};
      for (_i = 0, _len = songsRaw.length; _i < _len; _i++) {
        song = songsRaw[_i];
        if (!parsedRaw[song.albumid]) {
          parsedRaw[song.albumid] = [];
        }
        parsedRaw[song.albumid].push(song);
      }
      for (albumid in parsedRaw) {
        songSet = parsedRaw[albumid];
        collections[albumid] = new KodiEntities.SongCustomCollection(songSet);
      }
      return collections;
    }
  };
  KodiEntities.Song = (function(_super) {
    __extends(Song, _super);

    function Song() {
      return Song.__super__.constructor.apply(this, arguments);
    }

    Song.prototype.defaults = function() {
      var fields;
      fields = _.extend(this.modelDefaults, {
        songid: 1,
        artist: ''
      });
      return this.parseFieldsToDefaults(helpers.entities.getFields(API.fields, 'full'), fields);
    };

    Song.prototype.methods = {
      read: ['AudioLibrary.GetSongDetails', 'songidid', 'properties']
    };

    Song.prototype.parse = function(resp, xhr) {
      var obj;
      obj = resp.songdetails != null ? resp.songdetails : resp;
      if (resp.songdetails != null) {
        obj.fullyloaded = true;
      }
      return this.parseModel('song', obj, obj.songid);
    };

    return Song;

  })(App.KodiEntities.Model);
  KodiEntities.SongFilteredCollection = (function(_super) {
    __extends(SongFilteredCollection, _super);

    function SongFilteredCollection() {
      return SongFilteredCollection.__super__.constructor.apply(this, arguments);
    }

    SongFilteredCollection.prototype.model = KodiEntities.Song;

    SongFilteredCollection.prototype.methods = {
      read: ['AudioLibrary.GetSongs', 'arg1', 'arg2', 'arg3', 'arg4']
    };

    SongFilteredCollection.prototype.arg1 = function() {
      return helpers.entities.getFields(API.fields, 'small');
    };

    SongFilteredCollection.prototype.arg2 = function() {
      return this.argLimit();
    };

    SongFilteredCollection.prototype.arg3 = function() {
      return this.argSort("track", "ascending");
    };

    SongFilteredCollection.prototype.arg4 = function() {
      return this.argFilter();
    };

    SongFilteredCollection.prototype.parse = function(resp, xhr) {
      return this.getResult(resp, 'songs');
    };

    return SongFilteredCollection;

  })(App.KodiEntities.Collection);
  KodiEntities.SongCustomCollection = (function(_super) {
    __extends(SongCustomCollection, _super);

    function SongCustomCollection() {
      return SongCustomCollection.__super__.constructor.apply(this, arguments);
    }

    SongCustomCollection.prototype.model = KodiEntities.Song;

    return SongCustomCollection;

  })(App.KodiEntities.Collection);
  App.reqres.setHandler("song:entity", function(id, options) {
    if (options == null) {
      options = {};
    }
    return API.getSong(id, options);
  });
  App.reqres.setHandler("song:filtered:entities", function(options) {
    if (options == null) {
      options = {};
    }
    return API.getFilteredSongs(options);
  });
  return App.reqres.setHandler("song:albumparse:entities", function(songs) {
    return API.parseSongsToAlbumSongs(songs);
  });
});

this.Kodi.module("KodiEntities", function(KodiEntities, App, Backbone, Marionette, $, _) {

  /*
    API Helpers
   */
  var API;
  API = {
    fields: {
      minimal: ['title'],
      small: ['thumbnail', 'playcount', 'lastplayed', 'dateadded', 'episode', 'rating', 'year', 'file', 'genre', 'watchedepisodes'],
      full: ['fanart', 'studio', 'mpaa', 'cast', 'imdbnumber', 'episodeguide', 'watchedepisodes']
    },
    getEntity: function(id, options) {
      var entity;
      entity = new App.KodiEntities.TVShow();
      entity.set({
        tvshowid: parseInt(id),
        properties: helpers.entities.getFields(API.fields, 'full')
      });
      entity.fetch(options);
      return entity;
    },
    getCollection: function(options) {
      var collection, defaultOptions;
      defaultOptions = {
        cache: true
      };
      options = _.extend(defaultOptions, options);
      collection = new KodiEntities.TVShowCollection();
      collection.fetch(options);
      return collection;
    }
  };

  /*
   Models and collections.
   */
  KodiEntities.TVShow = (function(_super) {
    __extends(TVShow, _super);

    function TVShow() {
      return TVShow.__super__.constructor.apply(this, arguments);
    }

    TVShow.prototype.defaults = function() {
      var fields;
      fields = _.extend(this.modelDefaults, {
        tvshowid: 1,
        tvshow: ''
      });
      return this.parseFieldsToDefaults(helpers.entities.getFields(API.fields, 'full'), fields);
    };

    TVShow.prototype.methods = {
      read: ['VideoLibrary.GetTVShowDetails', 'tvshowid', 'properties']
    };

    TVShow.prototype.parse = function(resp, xhr) {
      var obj;
      obj = resp.tvshowdetails != null ? resp.tvshowdetails : resp;
      if (resp.tvshowdetails != null) {
        obj.fullyloaded = true;
      }
      obj.unwatched = obj.episode - obj.watchedepisodes;
      return this.parseModel('tvshow', obj, obj.tvshowid);
    };

    return TVShow;

  })(App.KodiEntities.Model);
  KodiEntities.TVShowCollection = (function(_super) {
    __extends(TVShowCollection, _super);

    function TVShowCollection() {
      return TVShowCollection.__super__.constructor.apply(this, arguments);
    }

    TVShowCollection.prototype.model = KodiEntities.TVShow;

    TVShowCollection.prototype.methods = {
      read: ['VideoLibrary.GetTVShows', 'arg1', 'arg2', 'arg3']
    };

    TVShowCollection.prototype.arg1 = function() {
      return helpers.entities.getFields(API.fields, 'small');
    };

    TVShowCollection.prototype.arg2 = function() {
      return this.argLimit();
    };

    TVShowCollection.prototype.arg3 = function() {
      return this.argSort("title", "ascending");
    };

    TVShowCollection.prototype.parse = function(resp, xhr) {
      return this.getResult(resp, 'tvshows');
    };

    return TVShowCollection;

  })(App.KodiEntities.Collection);
  KodiEntities.TVShowFilteredCollection = (function(_super) {
    __extends(TVShowFilteredCollection, _super);

    function TVShowFilteredCollection() {
      return TVShowFilteredCollection.__super__.constructor.apply(this, arguments);
    }

    TVShowFilteredCollection.prototype.methods = {
      read: ['VideoLibrary.GetTVShowss', 'arg1', 'arg2', 'arg3', 'arg4']
    };

    TVShowFilteredCollection.prototype.arg4 = function() {
      return this.argFilter();
    };

    return TVShowFilteredCollection;

  })(KodiEntities.TVShowCollection);

  /*
   Request Handlers.
   */
  App.reqres.setHandler("tvshow:entity", function(id, options) {
    if (options == null) {
      options = {};
    }
    return API.getEntity(id, options);
  });
  return App.reqres.setHandler("tvshow:entities", function(options) {
    if (options == null) {
      options = {};
    }
    return API.getCollection(options);
  });
});


/*
  Custom saved playlists, saved in local storage
 */

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    savedFields: ['id', 'position', 'file', 'type', 'label', 'thumbnail', 'artist', 'album', 'artistid', 'artistid', 'tvshowid', 'tvshow', 'year', 'rating', 'duration', 'track', 'url'],
    playlistKey: 'localplaylist:list',
    playlistItemNamespace: 'localplaylist:item:',
    thumbsUpNamespace: 'thumbs:',
    getPlaylistKey: function(key) {
      return this.playlistItemNamespace + key;
    },
    getThumbsKey: function(media) {
      return this.thumbsUpNamespace + media;
    },
    getListCollection: function(type) {
      var collection;
      if (type == null) {
        type = 'list';
      }
      collection = new Entities.localPlaylistCollection();
      collection.fetch();
      collection.where({
        type: type
      });
      return collection;
    },
    addList: function(model) {
      var collection;
      collection = this.getListCollection();
      model.id = this.getNextId();
      collection.create(model);
      return collection;
    },
    getNextId: function() {
      var collection, items, lastItem, nextId;
      collection = API.getListCollection();
      items = collection.getRawCollection();
      if (items.length === 0) {
        nextId = 1;
      } else {
        lastItem = _.max(items, function(item) {
          return item.id;
        });
        nextId = lastItem.id + 1;
      }
      return nextId;
    },
    getItemCollection: function(listId) {
      var collection;
      collection = new Entities.localPlaylistItemCollection([], {
        key: listId
      });
      collection.fetch();
      return collection;
    },
    addItemsToPlaylist: function(playlistId, collection) {
      var item, items, position;
      items = collection.getRawCollection();
      collection = this.getItemCollection(playlistId);
      for (position in items) {
        item = items[position];
        collection.create(API.getSavedModelFromSource(item, position));
      }
      return collection;
    },
    getSavedModelFromSource: function(item, position) {
      var fieldName, idfield, newItem, _i, _len, _ref;
      newItem = {};
      _ref = this.savedFields;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        fieldName = _ref[_i];
        if (item[fieldName]) {
          newItem[fieldName] = item[fieldName];
        }
      }
      newItem.position = position;
      idfield = item.type + 'id';
      newItem[idfield] = item[idfield];
      return newItem;
    },
    clearPlaylist: function(playlistId) {
      var collection, model, _i, _len, _ref;
      collection = this.getItemCollection(playlistId);
      _ref = collection.models;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        model = _ref[_i];
        if (model != null) {
          model.destroy();
        }
      }
    }
  };
  Entities.localPlaylist = (function(_super) {
    __extends(localPlaylist, _super);

    function localPlaylist() {
      return localPlaylist.__super__.constructor.apply(this, arguments);
    }

    localPlaylist.prototype.defaults = {
      id: 0,
      name: '',
      media: '',
      type: 'list'
    };

    return localPlaylist;

  })(Entities.Model);
  Entities.localPlaylistCollection = (function(_super) {
    __extends(localPlaylistCollection, _super);

    function localPlaylistCollection() {
      return localPlaylistCollection.__super__.constructor.apply(this, arguments);
    }

    localPlaylistCollection.prototype.model = Entities.localPlaylist;

    localPlaylistCollection.prototype.localStorage = new Backbone.LocalStorage(API.playlistKey);

    return localPlaylistCollection;

  })(Entities.Collection);
  Entities.localPlaylistItem = (function(_super) {
    __extends(localPlaylistItem, _super);

    function localPlaylistItem() {
      return localPlaylistItem.__super__.constructor.apply(this, arguments);
    }

    localPlaylistItem.prototype.idAttribute = "position";

    localPlaylistItem.prototype.defaults = function() {
      var f, fields, _i, _len, _ref;
      fields = {};
      _ref = API.savedFields;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        f = _ref[_i];
        fields[f] = '';
      }
      return fields;
    };

    return localPlaylistItem;

  })(Entities.Model);
  Entities.localPlaylistItemCollection = (function(_super) {
    __extends(localPlaylistItemCollection, _super);

    function localPlaylistItemCollection() {
      return localPlaylistItemCollection.__super__.constructor.apply(this, arguments);
    }

    localPlaylistItemCollection.prototype.model = Entities.localPlaylistItem;

    localPlaylistItemCollection.prototype.initialize = function(model, options) {
      return this.localStorage = new Backbone.LocalStorage(API.getPlaylistKey(options.key));
    };

    return localPlaylistItemCollection;

  })(Entities.Collection);

  /*
    Saved Playlists
   */
  App.reqres.setHandler("localplaylist:add:entity", function(name, media, type) {
    if (type == null) {
      type = 'list';
    }
    return API.addList({
      name: name,
      media: media,
      type: type
    });
  });
  App.reqres.setHandler("localplaylist:remove:entity", function(id) {
    var collection, model;
    collection = API.getListCollection();
    model = collection.find({
      id: id
    });
    return model.destroy();
  });
  App.reqres.setHandler("localplaylist:entities", function() {
    return API.getListCollection();
  });
  App.reqres.setHandler("localplaylist:clear:entities", function(playlistId) {
    return API.clearPlaylist(playlistId);
  });
  App.reqres.setHandler("localplaylist:entity", function(id) {
    var collection;
    collection = API.getListCollection();
    return collection.find({
      id: id
    });
  });
  App.reqres.setHandler("localplaylist:item:entities", function(key) {
    return API.getItemCollection(key);
  });
  App.reqres.setHandler("localplaylist:item:add:entities", function(playlistId, collection) {
    return API.addItemsToPlaylist(playlistId, collection);
  });

  /*
    Thumbs up lists
   */
  App.reqres.setHandler("thumbsup:toggle:entity", function(model) {
    var collection, existing, media, position;
    media = model.get('type');
    collection = API.getItemCollection(API.getThumbsKey(media));
    position = collection ? collection.length + 1 : 1;
    existing = collection.findWhere({
      id: model.get('id')
    });
    if (existing) {
      existing.destroy();
    } else {
      collection.create(API.getSavedModelFromSource(model.attributes, position));
    }
    return collection;
  });
  App.reqres.setHandler("thumbsup:get:entities", function(media) {
    return API.getItemCollection(API.getThumbsKey(media));
  });
  return App.reqres.setHandler("thumbsup:check", function(model) {
    var collection, existing;
    collection = API.getItemCollection(API.getThumbsKey(model.get('type')));
    existing = collection.findWhere({
      id: model.get('id')
    });
    return _.isObject(existing);
  });
});

this.Kodi.module("Entities", function(Entities, App, Backbone, Marionette, $, _) {
  var API;
  Entities.NavMain = (function(_super) {
    __extends(NavMain, _super);

    function NavMain() {
      return NavMain.__super__.constructor.apply(this, arguments);
    }

    NavMain.prototype.defaults = {
      id: 0,
      title: 'Untitled',
      path: '',
      icon: '',
      classes: '',
      parent: 0,
      children: []
    };

    return NavMain;

  })(Entities.Model);
  Entities.NavMainCollection = (function(_super) {
    __extends(NavMainCollection, _super);

    function NavMainCollection() {
      return NavMainCollection.__super__.constructor.apply(this, arguments);
    }

    NavMainCollection.prototype.model = Entities.NavMain;

    return NavMainCollection;

  })(Entities.Collection);
  API = {
    getItems: function() {
      var nav;
      nav = [];
      nav.push({
        id: 1,
        title: "Music",
        path: 'music/artists',
        icon: 'mdi-av-my-library-music',
        classes: 'nav-music',
        parent: 0
      });
      nav.push({
        id: 2,
        title: "Artists",
        path: 'music/artists',
        icon: '',
        classes: '',
        parent: 1
      });
      nav.push({
        id: 3,
        title: "Albums",
        path: 'music/albums',
        icon: '',
        classes: '',
        parent: 1
      });
      nav.push({
        id: 4,
        title: "Recently Added",
        path: 'music/added',
        icon: '',
        classes: '',
        parent: 1
      });
      nav.push({
        id: 5,
        title: "Recently Played",
        path: 'music/played',
        icon: '',
        classes: '',
        parent: 1
      });
      nav.push({
        id: 11,
        title: "Movies",
        path: 'movies',
        icon: 'mdi-av-movie',
        classes: 'nav-movies',
        parent: 0
      });
      nav.push({
        id: 12,
        title: "Recently Added",
        path: 'movies/added',
        icon: '',
        classes: '',
        parent: 11
      });
      nav.push({
        id: 13,
        title: "All",
        path: 'movies',
        icon: '',
        classes: '',
        parent: 11
      });
      nav.push({
        id: 21,
        title: "TV Shows",
        path: 'tvshows',
        icon: 'mdi-hardware-tv',
        classes: 'nav-tv',
        parent: 0
      });
      nav.push({
        id: 22,
        title: "Recently Added",
        path: 'tvshows/added',
        icon: '',
        classes: '',
        parent: 21
      });
      nav.push({
        id: 23,
        title: "All",
        path: 'tvshows',
        icon: '',
        classes: '',
        parent: 21
      });
      nav.push({
        id: 31,
        title: "Browser",
        path: 'browser',
        icon: 'mdi-action-view-list',
        classes: 'nav-browser',
        parent: 0
      });
      nav.push({
        id: 32,
        title: "Files",
        path: 'browser/files',
        icon: '',
        classes: '',
        parent: 31
      });
      nav.push({
        id: 33,
        title: "AddOns",
        path: 'browser/addons',
        icon: '',
        classes: '',
        parent: 31
      });
      nav.push({
        id: 41,
        title: "Thumbs Up",
        path: 'thumbsup',
        icon: 'mdi-action-thumb-up',
        classes: 'nav-thumbs-up',
        parent: 0
      });
      nav.push({
        id: 51,
        title: "Settings",
        path: 'settings/web',
        icon: 'mdi-action-settings',
        classes: 'nav-browser',
        parent: 0
      });
      nav.push({
        id: 52,
        title: "Web Settings",
        path: 'settings/web',
        icon: '',
        classes: '',
        parent: 51
      });
      nav.push({
        id: 53,
        title: "Kodi Settings",
        path: 'settings/kodi',
        icon: '',
        classes: '',
        parent: 51
      });
      return nav;
    },
    getDefaultStructure: function() {
      var navCollection, navParsed;
      navParsed = this.sortStructure(this.getItems());
      navCollection = new Entities.NavMainCollection(navParsed);
      return navCollection;
    },
    getChildStructure: function(parentId) {
      var childItems, nav, parent;
      nav = this.getItems();
      parent = _.findWhere(nav, {
        id: parentId
      });
      childItems = _.where(nav, {
        parent: parentId
      });
      parent.items = new Entities.NavMainCollection(childItems);
      return new Entities.NavMain(parent);
    },
    sortStructure: function(structure) {
      var children, i, model, newParents, _i, _len, _name;
      children = {};
      for (_i = 0, _len = structure.length; _i < _len; _i++) {
        model = structure[_i];
        if (!((model.path != null) && model.parent !== 0)) {
          continue;
        }
        model.title = t.gettext(model.title);
        if (children[_name = model.parent] == null) {
          children[_name] = [];
        }
        children[model.parent].push(model);
      }
      newParents = [];
      for (i in structure) {
        model = structure[i];
        if (model.path != null) {
          if (model.parent === 0) {
            model.children = children[model.id];
            newParents.push(model);
          }
        }
      }
      return newParents;
    }
  };
  return App.reqres.setHandler("navMain:entities", function(parentId) {
    if (parentId == null) {
      parentId = 'all';
    }
    if (parentId === 'all') {
      return API.getDefaultStructure();
    } else {
      return API.getChildStructure(parentId);
    }
  });
});

this.Kodi.module("Controllers", function(Controllers, App, Backbone, Marionette, $, _) {
  return Controllers.Base = (function(_super) {
    __extends(Base, _super);

    Base.prototype.params = {};

    function Base(options) {
      if (options == null) {
        options = {};
      }
      this.region = options.region || App.request("default:region");
      this.params = helpers.url.params();
      Base.__super__.constructor.call(this, options);
      this._instance_id = _.uniqueId("controller");
      App.execute("register:instance", this, this._instance_id);
    }

    Base.prototype.close = function() {
      var args;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      delete this.region;
      delete this.options;
      Base.__super__.close.call(this, args);
      return App.execute("unregister:instance", this, this._instance_id);
    };

    Base.prototype.show = function(view) {
      this.listenTo(view, "close", this.close);
      return this.region.show(view);
    };

    return Base;

  })(Backbone.Marionette.Controller);
});

this.Kodi.module("Router", function(Router, App, Backbone, Marionette, $, _) {
  return Router.Base = (function(_super) {
    __extends(Base, _super);

    function Base() {
      return Base.__super__.constructor.apply(this, arguments);
    }

    Base.prototype.before = function(route, params) {
      return App.execute("loading:show:page");
    };

    Base.prototype.after = function(route, params) {
      return this.setBodyClasses();
    };

    Base.prototype.setBodyClasses = function() {
      var $body, section;
      $body = App.getRegion('root').$el;
      $body.removeClassRegex(/^section-/);
      $body.removeClassRegex(/^page-/);
      section = helpers.url.arg(0);
      if (section === '') {
        section = 'home';
      }
      $body.addClass('section-' + section);
      return $body.addClass('page-' + helpers.url.arg().join('-'));
    };

    return Base;

  })(Marionette.AppRouter);
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  return Views.CollectionView = (function(_super) {
    __extends(CollectionView, _super);

    function CollectionView() {
      return CollectionView.__super__.constructor.apply(this, arguments);
    }

    CollectionView.prototype.itemViewEventPrefix = "childview";

    return CollectionView;

  })(Backbone.Marionette.CollectionView);
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  return Views.CompositeView = (function(_super) {
    __extends(CompositeView, _super);

    function CompositeView() {
      return CompositeView.__super__.constructor.apply(this, arguments);
    }

    CompositeView.prototype.itemViewEventPrefix = "childview";

    return CompositeView;

  })(Backbone.Marionette.CompositeView);
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  return Views.ItemView = (function(_super) {
    __extends(ItemView, _super);

    function ItemView() {
      return ItemView.__super__.constructor.apply(this, arguments);
    }

    return ItemView;

  })(Backbone.Marionette.ItemView);
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  return Views.LayoutView = (function(_super) {
    __extends(LayoutView, _super);

    function LayoutView() {
      return LayoutView.__super__.constructor.apply(this, arguments);
    }

    return LayoutView;

  })(Backbone.Marionette.LayoutView);
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  var _remove;
  _remove = Marionette.View.prototype.remove;
  return _.extend(Marionette.View.prototype, {
    themeLink: function(name, url, options) {
      var attrs;
      if (options == null) {
        options = {};
      }
      _.defaults(options, {
        external: false,
        className: ''
      });
      attrs = !options.external ? {
        href: "#" + url
      } : void 0;
      if (options.className !== '') {
        attrs["class"] = options.className;
      }
      return this.themeTag('a', attrs, name);
    },
    parseAttributes: function(attrs) {
      var a, attr, val;
      a = [];
      for (attr in attrs) {
        val = attrs[attr];
        a.push("" + attr + "='" + val + "'");
      }
      return a.join(' ');
    },
    themeTag: function(el, attrs, value) {
      var attrsString;
      attrsString = this.parseAttributes(attrs);
      return "<" + el + " " + attrsString + ">" + value + "</" + el + ">";
    }
  });
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  return Views.CardView = (function(_super) {
    __extends(CardView, _super);

    function CardView() {
      return CardView.__super__.constructor.apply(this, arguments);
    }

    CardView.prototype.template = "views/card/card";

    CardView.prototype.tagName = "li";

    CardView.prototype.events = {
      "click .dropdown > i": "populateMenu",
      "click .thumbs": "toggleThumbs"
    };

    CardView.prototype.populateMenu = function() {
      var key, menu, val, _ref;
      menu = '';
      if (this.model.get('menu')) {
        _ref = this.model.get('menu');
        for (key in _ref) {
          val = _ref[key];
          menu += this.themeTag('li', {
            "class": key
          }, val);
        }
        return this.$el.find('.dropdown-menu').html(menu);
      }
    };

    CardView.prototype.toggleThumbs = function() {
      App.request("thumbsup:toggle:entity", this.model);
      return this.$el.toggleClass('thumbs-up');
    };

    CardView.prototype.attributes = function() {
      var classes;
      classes = ['card'];
      if (App.request("thumbsup:check", this.model)) {
        classes.push('thumbs-up');
      }
      return {
        "class": classes.join(' ')
      };
    };

    return CardView;

  })(App.Views.ItemView);
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  return Views.EmptyView = (function(_super) {
    __extends(EmptyView, _super);

    function EmptyView() {
      return EmptyView.__super__.constructor.apply(this, arguments);
    }

    EmptyView.prototype.template = "views/empty/empty";

    EmptyView.prototype.regions = {
      regionEmptyContent: ".region-empty-content"
    };

    return EmptyView;

  })(App.Views.ItemView);
});

this.Kodi.module("Views", function(Views, App, Backbone, Marionette, $, _) {
  Views.LayoutWithSidebarFirstView = (function(_super) {
    __extends(LayoutWithSidebarFirstView, _super);

    function LayoutWithSidebarFirstView() {
      return LayoutWithSidebarFirstView.__super__.constructor.apply(this, arguments);
    }

    LayoutWithSidebarFirstView.prototype.template = "views/layouts/layout_with_sidebar_first";

    LayoutWithSidebarFirstView.prototype.regions = {
      regionSidebarFirst: ".region-first",
      regionContent: ".region-content"
    };

    return LayoutWithSidebarFirstView;

  })(App.Views.LayoutView);
  Views.LayoutWithHeaderView = (function(_super) {
    __extends(LayoutWithHeaderView, _super);

    function LayoutWithHeaderView() {
      return LayoutWithHeaderView.__super__.constructor.apply(this, arguments);
    }

    LayoutWithHeaderView.prototype.template = "views/layouts/layout_with_header";

    LayoutWithHeaderView.prototype.regions = {
      regionHeader: ".region-header",
      regionContent: ".region-content"
    };

    return LayoutWithHeaderView;

  })(App.Views.LayoutView);
  return Views.LayoutDetailsHeaderView = (function(_super) {
    __extends(LayoutDetailsHeaderView, _super);

    function LayoutDetailsHeaderView() {
      return LayoutDetailsHeaderView.__super__.constructor.apply(this, arguments);
    }

    LayoutDetailsHeaderView.prototype.template = "views/layouts/layout_details_header";

    LayoutDetailsHeaderView.prototype.regions = {
      regionSide: ".region-details-side",
      regionTitle: ".region-details-title",
      regionMeta: ".region-details-meta",
      regionMetaSideFirst: ".region-details-meta-side-first",
      regionMetaSideSecond: ".region-details-meta-side-second",
      regionMetaBelow: ".region-details-meta-below"
    };

    return LayoutDetailsHeaderView;

  })(App.Views.LayoutView);
});

this.Kodi.module("Components.Form", function(Form, App, Backbone, Marionette, $, _) {
  Form.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function(options) {
      var config;
      if (options == null) {
        options = {};
      }
      config = options.config ? options.config : {};
      this.formLayout = this.getFormLayout(config);
      this.listenTo(this.formLayout, "show", (function(_this) {
        return function() {
          _this.formBuild(options.form, options.formState, config);
          return $.material.init();
        };
      })(this));
      return this.listenTo(this.formLayout, "form:submit", (function(_this) {
        return function() {
          return _this.formSubmit(options);
        };
      })(this));
    };

    Controller.prototype.formSubmit = function(options) {
      var data;
      data = Backbone.Syphon.serialize(this.formLayout);
      return this.processFormSubmit(data, options);
    };

    Controller.prototype.processFormSubmit = function(data, options) {
      if (options.config && typeof options.config.callback === 'function') {
        return options.config.callback(data, this.formLayout);
      }
    };

    Controller.prototype.getFormLayout = function(options) {
      if (options == null) {
        options = {};
      }
      return new Form.FormWrapper({
        config: options
      });
    };

    Controller.prototype.formBuild = function(form, formState, options) {
      var buildView, collection;
      if (form == null) {
        form = [];
      }
      if (formState == null) {
        formState = {};
      }
      if (options == null) {
        options = {};
      }
      collection = App.request("form:item:entites", form, formState);
      buildView = new Form.Groups({
        collection: collection
      });
      return this.formLayout.formContentRegion.show(buildView);
    };

    return Controller;

  })(App.Controllers.Base);
  return App.reqres.setHandler("form:wrapper", function(options) {
    var formController;
    if (options == null) {
      options = {};
    }
    formController = new Form.Controller(options);
    return formController.formLayout;
  });
});

this.Kodi.module("Components.Form", function(Form, App, Backbone, Marionette, $, _) {
  Form.FormWrapper = (function(_super) {
    __extends(FormWrapper, _super);

    function FormWrapper() {
      return FormWrapper.__super__.constructor.apply(this, arguments);
    }

    FormWrapper.prototype.template = "components/form/form";

    FormWrapper.prototype.tagName = "form";

    FormWrapper.prototype.regions = {
      formContentRegion: ".form-content-region",
      formResponse: ".response"
    };

    FormWrapper.prototype.triggers = {
      "click .form-save": "form:submit",
      "click [data-form-button='cancel']": "form:cancel"
    };

    FormWrapper.prototype.modelEvents = {
      "change:_errors": "changeErrors",
      "sync:start": "syncStart",
      "sync:stop": "syncStop"
    };

    FormWrapper.prototype.initialize = function() {
      this.config = this.options.config;
      return this.on("form:save", (function(_this) {
        return function(msg) {
          return _this.addSuccessMsg(msg);
        };
      })(this));
    };

    FormWrapper.prototype.attributes = function() {
      var attrs;
      attrs = {
        "class": 'component-form'
      };
      if (this.options.config && this.options.config.attributes) {
        attrs = _.extend(attrs, this.options.config.attributes);
      }
      return attrs;
    };

    FormWrapper.prototype.onShow = function() {
      return _.defer((function(_this) {
        return function() {
          if (_this.config.focusFirstInput) {
            _this.focusFirstInput();
          }
          return $('.btn').ripples({
            color: 'rgba(255,255,255,0.1)'
          });
        };
      })(this));
    };

    FormWrapper.prototype.focusFirstInput = function() {
      return this.$(":input:visible:enabled:first").focus();
    };

    FormWrapper.prototype.changeErrors = function(model, errors, options) {
      if (this.config.errors) {
        if (_.isEmpty(errors)) {
          return this.removeErrors();
        } else {
          return this.addErrors(errors);
        }
      }
    };

    FormWrapper.prototype.removeErrors = function() {
      return this.$(".error").removeClass("error").find("small").remove();
    };

    FormWrapper.prototype.addErrors = function(errors) {
      var array, name, _results;
      if (errors == null) {
        errors = {};
      }
      _results = [];
      for (name in errors) {
        array = errors[name];
        _results.push(this.addError(name, array[0]));
      }
      return _results;
    };

    FormWrapper.prototype.addError = function(name, error) {
      var el, sm;
      el = this.$("[name='" + name + "']");
      sm = $("<small>").text(error);
      return el.after(sm).closest(".row").addClass("error");
    };

    FormWrapper.prototype.addSuccessMsg = function(msg) {
      var $el;
      $el = $(".response", this.$el);
      $el.html(msg).show();
      return setTimeout((function() {
        return $el.fadeOut();
      }), 5000);
    };

    return FormWrapper;

  })(App.Views.LayoutView);
  Form.Item = (function(_super) {
    __extends(Item, _super);

    function Item() {
      return Item.__super__.constructor.apply(this, arguments);
    }

    Item.prototype.template = 'components/form/form_item';

    Item.prototype.tagName = 'div';

    Item.prototype.initialize = function() {
      var attrs, baseAttrs, el, key, materialBaseAttrs, options, val, _ref;
      baseAttrs = _.extend({
        id: 'form-edit-' + this.model.get('id'),
        name: this.model.get('id')
      }, this.model.get('attributes'));
      materialBaseAttrs = _.extend(baseAttrs, {
        "class": 'form-control'
      });
      switch (this.model.get('type')) {
        case 'checkbox':
          attrs = {
            type: 'checkbox',
            value: 1,
            "class": 'form-checkbox'
          };
          if (this.model.get('defaultValue') === true) {
            attrs.checked = 'checked';
          }
          el = this.themeTag('input', _.extend(baseAttrs, attrs), '');
          break;
        case 'textfield':
          attrs = {
            type: 'text',
            value: this.model.get('defaultValue')
          };
          el = this.themeTag('input', _.extend(materialBaseAttrs, attrs), '');
          break;
        case 'textarea':
          el = this.themeTag('textarea', materialBaseAttrs, this.model.get('defaultValue'));
          break;
        case 'select':
          options = '';
          _ref = this.model.get('options');
          for (key in _ref) {
            val = _ref[key];
            attrs = {
              value: key
            };
            if (this.model.get('defaultValue') === key) {
              attrs.selected = 'selected';
            }
            options += this.themeTag('option', attrs, val);
          }
          el = this.themeTag('select', _.extend(baseAttrs, {
            "class": 'form-control'
          }), options);
          break;
        default:
          el = '';
      }
      return this.model.set({
        element: el
      });
    };

    Item.prototype.attributes = function() {
      return {
        "class": 'form-item form-group form-type-' + this.model.get('type') + ' form-edit-' + this.model.get('id')
      };
    };

    return Item;

  })(App.Views.ItemView);
  Form.Group = (function(_super) {
    __extends(Group, _super);

    function Group() {
      return Group.__super__.constructor.apply(this, arguments);
    }

    Group.prototype.template = 'components/form/form_item_group';

    Group.prototype.tagName = 'div';

    Group.prototype.className = 'form-group';

    Group.prototype.childView = Form.Item;

    Group.prototype.childViewContainer = '.form-items';

    Group.prototype.initialize = function() {
      return this.collection = this.model.get('children');
    };

    return Group;

  })(App.Views.CompositeView);
  return Form.Groups = (function(_super) {
    __extends(Groups, _super);

    function Groups() {
      return Groups.__super__.constructor.apply(this, arguments);
    }

    Groups.prototype.childView = Form.Group;

    Groups.prototype.className = 'form-groups';

    return Groups;

  })(App.Views.CollectionView);
});

this.Kodi.module("AlbumApp", function(AlbumApp, App, Backbone, Marionette, $, _) {
  var API;
  AlbumApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "music/albums": "list",
      "music/album/:id": "view"
    };

    return Router;

  })(App.Router.Base);
  API = {
    list: function() {
      return new AlbumApp.List.Controller();
    },
    view: function(id) {
      return new AlbumApp.Show.Controller({
        id: id
      });
    },
    action: function(op, view) {
      var model, playlist;
      model = view.model;
      playlist = App.request("command:kodi:controller", 'audio', 'PlayList');
      switch (op) {
        case 'play':
          return playlist.play('albumid', model.get('albumid'));
        case 'add':
          return playlist.add('albumid', model.get('albumid'));
        case 'localadd':
          return App.execute("playlistlocal:additems", 'albumid', model.get('albumid'));
      }
    }
  };
  App.on("before:start", function() {
    return new AlbumApp.Router({
      controller: API
    });
  });
  return App.commands.setHandler('album:action', function(op, model) {
    return API.action(op, model);
  });
});

this.Kodi.module("AlbumApp.List", function(List, App, Backbone, Marionette, $, _) {
  return List.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function() {
      var collection;
      collection = App.request("album:entities");
      return App.execute("when:entity:fetched", collection, (function(_this) {
        return function() {
          collection.availableFilters = _this.getAvailableFilters();
          collection.sectionId = 1;
          _this.layout = _this.getLayoutView(collection);
          _this.listenTo(_this.layout, "show", function() {
            _this.renderList(collection);
            return _this.getFiltersView(collection);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(collection) {
      return new List.ListLayout({
        collection: collection
      });
    };

    Controller.prototype.getAlbumsView = function(collection) {
      var view;
      view = new List.Albums({
        collection: collection
      });
      this.bindTriggers(view);
      return view;
    };

    Controller.prototype.bindTriggers = function(view) {
      this.listenTo(view, 'childview:album:play', function(list, item) {
        return App.execute('album:action', 'play', item);
      });
      this.listenTo(view, 'childview:album:add', function(list, item) {
        return App.execute('album:action', 'add', item);
      });
      return this.listenTo(view, 'childview:album:localadd', function(list, item) {
        return App.execute('album:action', 'localadd', item);
      });
    };

    Controller.prototype.getAvailableFilters = function() {
      return {
        sort: ['album', 'year', 'rating'],
        filter: ['year', 'genre']
      };
    };

    Controller.prototype.getFiltersView = function(collection) {
      var filters;
      filters = App.request('filter:show', collection);
      this.layout.regionSidebarFirst.show(filters);
      return this.listenTo(filters, "filter:changed", (function(_this) {
        return function() {
          return _this.renderList(collection);
        };
      })(this));
    };

    Controller.prototype.renderList = function(collection) {
      var filteredCollection, view;
      App.execute("loading:show:view", this.layout.regionContent);
      filteredCollection = App.request('filter:apply:entites', collection);
      view = this.getAlbumsView(filteredCollection);
      return this.layout.regionContent.show(view);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("AlbumApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.ListLayout = (function(_super) {
    __extends(ListLayout, _super);

    function ListLayout() {
      return ListLayout.__super__.constructor.apply(this, arguments);
    }

    ListLayout.prototype.className = "album-list";

    return ListLayout;

  })(App.Views.LayoutWithSidebarFirstView);
  List.AlbumTeaser = (function(_super) {
    __extends(AlbumTeaser, _super);

    function AlbumTeaser() {
      return AlbumTeaser.__super__.constructor.apply(this, arguments);
    }

    AlbumTeaser.prototype.triggers = {
      "click .play": "album:play",
      "click .dropdown .add": "album:add",
      "click .dropdown .localadd": "album:localadd"
    };

    AlbumTeaser.prototype.initialize = function() {
      var artistLink;
      this.model.set({
        actions: {
          thumbs: 'Thumbs up'
        }
      });
      this.model.set({
        menu: {
          add: 'Add to Kodi playlist',
          localadd: 'Add to local playlist',
          divider: '',
          localplay: 'Play in browser'
        }
      });
      artistLink = this.themeLink(this.model.get('artist'), helpers.url.get('artist', this.model.get('artistid')));
      return this.model.set({
        subtitle: artistLink
      });
    };

    return AlbumTeaser;

  })(App.Views.CardView);
  List.Empty = (function(_super) {
    __extends(Empty, _super);

    function Empty() {
      return Empty.__super__.constructor.apply(this, arguments);
    }

    Empty.prototype.tagName = "li";

    Empty.prototype.className = "album-empty-result";

    return Empty;

  })(App.Views.EmptyView);
  return List.Albums = (function(_super) {
    __extends(Albums, _super);

    function Albums() {
      return Albums.__super__.constructor.apply(this, arguments);
    }

    Albums.prototype.childView = List.AlbumTeaser;

    Albums.prototype.emptyView = List.Empty;

    Albums.prototype.tagName = "ul";

    Albums.prototype.sort = 'artist';

    Albums.prototype.className = "card-grid--square";

    return Albums;

  })(App.Views.CollectionView);
});

this.Kodi.module("AlbumApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    bindTriggers: function(view) {
      App.listenTo(view, 'album:play', function(item) {
        return App.execute('album:action', 'play', item);
      });
      App.listenTo(view, 'album:add', function(item) {
        return App.execute('album:action', 'add', item);
      });
      return App.listenTo(view, 'album:localadd', function(item) {
        return App.execute('album:action', 'localadd', item);
      });
    },
    getAlbumsFromSongs: function(songs) {
      var album, albumid, albumsCollectionView, songCollection;
      albumsCollectionView = new Show.WithSongsCollection();
      albumsCollectionView.on("add:child", (function(_this) {
        return function(albumView) {
          return App.execute("when:entity:fetched", album, function() {
            var model, songView, teaser;
            model = albumView.model;
            teaser = new Show.AlbumTeaser({
              model: model
            });
            API.bindTriggers(teaser);
            albumView.regionMeta.show(teaser);
            songView = App.request("song:list:view", songs[model.get('albumid')]);
            return albumView.regionSongs.show(songView);
          });
        };
      })(this));
      for (albumid in songs) {
        songCollection = songs[albumid];
        album = App.request("album:entity", albumid, {
          success: function(album) {
            return albumsCollectionView.addChild(album, Show.WithSongsLayout);
          }
        });
      }
      return albumsCollectionView;
    }
  };
  Show.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function(options) {
      var album, id;
      id = parseInt(options.id);
      album = App.request("album:entity", id);
      return App.execute("when:entity:fetched", album, (function(_this) {
        return function() {
          App.execute("images:fanart:set", album.get('fanart'));
          _this.layout = _this.getLayoutView(album);
          _this.listenTo(_this.layout, "destroy", function() {
            return App.execute("images:fanart:set", 'none');
          });
          _this.listenTo(_this.layout, "show", function() {
            _this.getMusic(id);
            return _this.getDetailsLayoutView(album);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(album) {
      return new Show.PageLayout({
        model: album
      });
    };

    Controller.prototype.getDetailsLayoutView = function(album) {
      var headerLayout;
      headerLayout = new Show.HeaderLayout({
        model: album
      });
      this.listenTo(headerLayout, "show", (function(_this) {
        return function() {
          var detail, teaser;
          teaser = new Show.AlbumDetailTeaser({
            model: album
          });
          API.bindTriggers(teaser);
          detail = new Show.Details({
            model: album
          });
          headerLayout.regionSide.show(teaser);
          return headerLayout.regionMeta.show(detail);
        };
      })(this));
      return this.layout.regionHeader.show(headerLayout);
    };

    Controller.prototype.getMusic = function(id) {
      var options, songs;
      options = {
        filter: {
          albumid: id
        }
      };
      songs = App.request("song:filtered:entities", options);
      return App.execute("when:entity:fetched", songs, (function(_this) {
        return function() {
          var albumView, songView;
          albumView = new Show.WithSongsLayout();
          songView = App.request("song:list:view", songs);
          _this.listenTo(albumView, "show", function() {
            return albumView.regionSongs.show(songView);
          });
          return _this.layout.regionContent.show(albumView);
        };
      })(this));
    };

    return Controller;

  })(App.Controllers.Base);
  return App.reqres.setHandler("albums:withsongs:view", function(songs) {
    return API.getAlbumsFromSongs(songs);
  });
});

this.Kodi.module("AlbumApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  Show.WithSongsLayout = (function(_super) {
    __extends(WithSongsLayout, _super);

    function WithSongsLayout() {
      return WithSongsLayout.__super__.constructor.apply(this, arguments);
    }

    WithSongsLayout.prototype.template = 'apps/album/show/album_with_songs';

    WithSongsLayout.prototype.className = 'album-wrapper';

    WithSongsLayout.prototype.regions = {
      regionMeta: '.region-album-meta',
      regionSongs: '.region-album-songs'
    };

    return WithSongsLayout;

  })(App.Views.LayoutView);
  Show.WithSongsCollection = (function(_super) {
    __extends(WithSongsCollection, _super);

    function WithSongsCollection() {
      return WithSongsCollection.__super__.constructor.apply(this, arguments);
    }

    WithSongsCollection.prototype.childView = Show.WithSongsLayout;

    WithSongsCollection.prototype.tagName = "div";

    WithSongsCollection.prototype.sort = 'year';

    WithSongsCollection.prototype.className = "albums-wrapper";

    return WithSongsCollection;

  })(App.Views.CollectionView);
  Show.PageLayout = (function(_super) {
    __extends(PageLayout, _super);

    function PageLayout() {
      return PageLayout.__super__.constructor.apply(this, arguments);
    }

    PageLayout.prototype.className = 'album-show detail-container';

    return PageLayout;

  })(App.Views.LayoutWithHeaderView);
  Show.HeaderLayout = (function(_super) {
    __extends(HeaderLayout, _super);

    function HeaderLayout() {
      return HeaderLayout.__super__.constructor.apply(this, arguments);
    }

    HeaderLayout.prototype.className = 'album-details';

    return HeaderLayout;

  })(App.Views.LayoutDetailsHeaderView);
  Show.Details = (function(_super) {
    __extends(Details, _super);

    function Details() {
      return Details.__super__.constructor.apply(this, arguments);
    }

    Details.prototype.template = 'apps/album/show/details_meta';

    return Details;

  })(App.Views.ItemView);
  Show.AlbumTeaser = (function(_super) {
    __extends(AlbumTeaser, _super);

    function AlbumTeaser() {
      return AlbumTeaser.__super__.constructor.apply(this, arguments);
    }

    AlbumTeaser.prototype.tagName = "div";

    AlbumTeaser.prototype.className = "card-minimal";

    AlbumTeaser.prototype.initialize = function() {
      return this.model.set({
        subtitle: this.model.get('year')
      });
    };

    return AlbumTeaser;

  })(App.AlbumApp.List.AlbumTeaser);
  return Show.AlbumDetailTeaser = (function(_super) {
    __extends(AlbumDetailTeaser, _super);

    function AlbumDetailTeaser() {
      return AlbumDetailTeaser.__super__.constructor.apply(this, arguments);
    }

    AlbumDetailTeaser.prototype.className = "card-detail";

    return AlbumDetailTeaser;

  })(Show.AlbumTeaser);
});

this.Kodi.module("ArtistApp", function(ArtistApp, App, Backbone, Marionette, $, _) {
  var API;
  ArtistApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "music/artists": "list",
      "music": "list",
      "music/artist/:id": "view"
    };

    return Router;

  })(App.Router.Base);
  API = {
    list: function() {
      return new ArtistApp.List.Controller();
    },
    view: function(id) {
      return new ArtistApp.Show.Controller({
        id: id
      });
    },
    action: function(op, model) {
      var playlist;
      playlist = App.request("command:kodi:controller", 'audio', 'PlayList');
      switch (op) {
        case 'play':
          return playlist.play('artistid', model.get('artistid'));
        case 'add':
          return playlist.add('artistid', model.get('artistid'));
      }
    }
  };
  App.on("before:start", function() {
    return new ArtistApp.Router({
      controller: API
    });
  });
  return App.commands.setHandler('artist:action', function(op, model) {
    return API.action(op, model);
  });
});

this.Kodi.module("ArtistApp.List", function(List, App, Backbone, Marionette, $, _) {
  return List.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function() {
      var collection;
      collection = App.request("artist:entities");
      return App.execute("when:entity:fetched", collection, (function(_this) {
        return function() {
          collection.availableFilters = _this.getAvailableFilters();
          collection.sectionId = 1;
          _this.layout = _this.getLayoutView(collection);
          _this.listenTo(_this.layout, "show", function() {
            _this.renderList(collection);
            return _this.getFiltersView(collection);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(collection) {
      return new List.ListLayout({
        collection: collection
      });
    };

    Controller.prototype.getArtistsView = function(collection) {
      var view;
      view = new List.Artists({
        collection: collection
      });
      this.bindTriggers(view);
      return view;
    };

    Controller.prototype.bindTriggers = function(view) {
      this.listenTo(view, 'childview:artist:play', function(list, item) {
        return App.execute('artist:action', 'play', item.model);
      });
      return this.listenTo(view, 'childview:artist:add', function(list, item) {
        return App.execute('artist:action', 'add', item.model);
      });
    };

    Controller.prototype.getAvailableFilters = function() {
      return {
        sort: ['artist'],
        filter: ['mood', 'genre', 'style']
      };
    };

    Controller.prototype.getFiltersView = function(collection) {
      var filters;
      filters = App.request('filter:show', collection);
      this.layout.regionSidebarFirst.show(filters);
      return this.listenTo(filters, "filter:changed", (function(_this) {
        return function() {
          return _this.renderList(collection);
        };
      })(this));
    };

    Controller.prototype.renderList = function(collection) {
      var filteredCollection, view;
      App.execute("loading:show:view", this.layout.regionContent);
      filteredCollection = App.request('filter:apply:entites', collection);
      view = this.getArtistsView(filteredCollection);
      return this.layout.regionContent.show(view);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("ArtistApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.ListLayout = (function(_super) {
    __extends(ListLayout, _super);

    function ListLayout() {
      return ListLayout.__super__.constructor.apply(this, arguments);
    }

    ListLayout.prototype.className = "artist-list";

    return ListLayout;

  })(App.Views.LayoutWithSidebarFirstView);
  List.ArtistTeaser = (function(_super) {
    __extends(ArtistTeaser, _super);

    function ArtistTeaser() {
      return ArtistTeaser.__super__.constructor.apply(this, arguments);
    }

    ArtistTeaser.prototype.triggers = {
      "click .play": "artist:play",
      "click .dropdown .add": "artist:add"
    };

    ArtistTeaser.prototype.initialize = function() {
      this.model.set({
        actions: {
          thumbs: 'Thumbs up'
        }
      });
      return this.model.set({
        menu: {
          add: 'Add to Kodi playlist',
          savelist: 'Add to local playlist',
          divider: '',
          localplay: 'Play in browser'
        }
      });
    };

    return ArtistTeaser;

  })(App.Views.CardView);
  List.Empty = (function(_super) {
    __extends(Empty, _super);

    function Empty() {
      return Empty.__super__.constructor.apply(this, arguments);
    }

    Empty.prototype.tagName = "li";

    Empty.prototype.className = "artist-empty-result";

    return Empty;

  })(App.Views.EmptyView);
  return List.Artists = (function(_super) {
    __extends(Artists, _super);

    function Artists() {
      return Artists.__super__.constructor.apply(this, arguments);
    }

    Artists.prototype.childView = List.ArtistTeaser;

    Artists.prototype.emptyView = List.Empty;

    Artists.prototype.tagName = "ul";

    Artists.prototype.className = "card-grid--wide";

    return Artists;

  })(App.Views.CollectionView);
});

this.Kodi.module("ArtistApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  return Show.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function(options) {
      var artist, id;
      id = parseInt(options.id);
      artist = App.request("artist:entity", id);
      return App.execute("when:entity:fetched", artist, (function(_this) {
        return function() {
          App.execute("images:fanart:set", artist.get('fanart'));
          _this.layout = _this.getLayoutView(artist);
          _this.listenTo(_this.layout, "destroy", function() {
            return App.execute("images:fanart:set", 'none');
          });
          _this.listenTo(_this.layout, "show", function() {
            _this.getMusic(id);
            return _this.getDetailsLayoutView(artist);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(artist) {
      return new Show.PageLayout({
        model: artist
      });
    };

    Controller.prototype.getDetailsLayoutView = function(artist) {
      var headerLayout;
      headerLayout = new Show.HeaderLayout({
        model: artist
      });
      this.listenTo(headerLayout, "show", (function(_this) {
        return function() {
          var detail, teaser;
          teaser = new Show.ArtistTeaser({
            model: artist
          });
          detail = new Show.Details({
            model: artist
          });
          headerLayout.regionSide.show(teaser);
          return headerLayout.regionMeta.show(detail);
        };
      })(this));
      return this.layout.regionHeader.show(headerLayout);
    };

    Controller.prototype.getMusic = function(id) {
      var options, songs;
      options = {
        filter: {
          artistid: id
        }
      };
      songs = App.request("song:filtered:entities", options);
      return App.execute("when:entity:fetched", songs, (function(_this) {
        return function() {
          var albumsCollection, songsCollections;
          songsCollections = App.request("song:albumparse:entities", songs);
          albumsCollection = App.request("albums:withsongs:view", songsCollections);
          return _this.layout.regionContent.show(albumsCollection);
        };
      })(this));
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("ArtistApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  Show.PageLayout = (function(_super) {
    __extends(PageLayout, _super);

    function PageLayout() {
      return PageLayout.__super__.constructor.apply(this, arguments);
    }

    PageLayout.prototype.className = 'artist-show detail-container';

    return PageLayout;

  })(App.Views.LayoutWithHeaderView);
  Show.HeaderLayout = (function(_super) {
    __extends(HeaderLayout, _super);

    function HeaderLayout() {
      return HeaderLayout.__super__.constructor.apply(this, arguments);
    }

    HeaderLayout.prototype.className = 'artist-details';

    return HeaderLayout;

  })(App.Views.LayoutDetailsHeaderView);
  Show.Details = (function(_super) {
    __extends(Details, _super);

    function Details() {
      return Details.__super__.constructor.apply(this, arguments);
    }

    Details.prototype.template = 'apps/artist/show/details_meta';

    return Details;

  })(App.Views.ItemView);
  return Show.ArtistTeaser = (function(_super) {
    __extends(ArtistTeaser, _super);

    function ArtistTeaser() {
      return ArtistTeaser.__super__.constructor.apply(this, arguments);
    }

    ArtistTeaser.prototype.tagName = "div";

    ArtistTeaser.prototype.className = "card-detail";

    return ArtistTeaser;

  })(App.ArtistApp.List.ArtistTeaser);
});

this.Kodi.module("BrowserApp", function(BrowserApp, App, Backbone, Marionette, $, _) {
  var API;
  BrowserApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "browser": "list",
      "browser/:media/:id": "view"
    };

    return Router;

  })(App.Router.Base);
  API = {
    list: function() {
      return new BrowserApp.List.Controller;
    },
    view: function(media, id) {
      return new BrowserApp.List.Controller({
        media: media,
        id: id
      });
    }
  };
  return App.on("before:start", function() {
    return new BrowserApp.Router({
      controller: API
    });
  });
});

this.Kodi.module("BrowserApp.List", function(List, App, Backbone, Marionette, $, _) {
  return List.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.sourceCollection = {};

    Controller.prototype.backButtonModel = {};

    Controller.prototype.initialize = function(options) {
      if (options == null) {
        options = {};
      }
      console.log(options);
      this.layout = this.getLayout();
      this.listenTo(this.layout, "show", (function(_this) {
        return function() {
          _this.getSources(options);
          return _this.getFolderLayout();
        };
      })(this));
      return App.regionContent.show(this.layout);
    };

    Controller.prototype.getLayout = function() {
      return new List.ListLayout();
    };

    Controller.prototype.getFolderLayout = function() {
      this.folderLayout = new List.FolderLayout();
      return this.layout.regionContent.show(this.folderLayout);
    };

    Controller.prototype.getSources = function(options) {
      var sources;
      sources = App.request("file:source:entities", 'video');
      return App.execute("when:entity:fetched", sources, (function(_this) {
        return function() {
          var setView, sets;
          _this.sourceCollection = sources;
          sets = App.request("file:source:media:entities", sources);
          setView = new List.SourcesSet({
            collection: sets
          });
          _this.layout.regionSidebarFirst.show(setView);
          _this.listenTo(setView, 'childview:childview:source:open', function(set, item) {
            return _this.getFolder(item.model);
          });
          return _this.loadFromUrl(options);
        };
      })(this));
    };

    Controller.prototype.loadFromUrl = function(options) {
      var model;
      if (options.media && options.id) {
        model = App.request("file:url:entity", options.media, options.id);
        console.log(model);
        return this.getFolder(model);
      }
    };

    Controller.prototype.getFolder = function(model) {
      var collection, pathCollection;
      App.navigate(model.get('url'));
      collection = App.request("file:entities", {
        file: model.get('file'),
        media: model.get('media')
      });
      pathCollection = App.request("file:path:entities", model.get('file'), this.sourceCollection);
      this.getPathList(pathCollection);
      return App.execute("when:entity:fetched", collection, (function(_this) {
        return function() {
          var collections;
          collections = App.request("file:parsed:entities", collection);
          console.log(collections);
          _this.getFolderList(collections.directory);
          return _this.getFileList(collections.file);
        };
      })(this));
    };

    Controller.prototype.getFolderList = function(collection) {
      var folderView;
      folderView = new List.FolderList({
        collection: collection
      });
      this.folderLayout.regionFolders.show(folderView);
      this.getBackButton();
      this.listenTo(folderView, 'childview:folder:open', (function(_this) {
        return function(set, item) {
          console.log('clicked', item);
          return _this.getFolder(item.model);
        };
      })(this));
      return this.listenTo(folderView, 'childview:folder:play', (function(_this) {
        return function(set, item) {
          var playlist;
          playlist = App.request("command:kodi:controller", item.model.get('player'), 'PlayList');
          return playlist.play('directory', item.model.get('file'));
        };
      })(this));
    };

    Controller.prototype.getFileList = function(collection) {
      var fileView;
      fileView = new List.FileList({
        collection: collection
      });
      this.folderLayout.regionFiles.show(fileView);
      return this.listenTo(fileView, 'childview:file:play', (function(_this) {
        return function(set, item) {
          var playlist;
          playlist = App.request("command:kodi:controller", item.model.get('player'), 'PlayList');
          console.log('playing', item.model.get('player'), item.model.get('file'));
          return playlist.play('file', item.model.get('file'));
        };
      })(this));
    };

    Controller.prototype.getPathList = function(collection) {
      var pathView;
      pathView = new List.PathList({
        collection: collection
      });
      this.folderLayout.regionPath.show(pathView);
      this.setBackModel(collection);
      return this.listenTo(pathView, 'childview:folder:open', (function(_this) {
        return function(set, item) {
          return _this.getFolder(item.model);
        };
      })(this));
    };

    Controller.prototype.setBackModel = function(pathCollection) {
      if (pathCollection.length >= 2) {
        return this.backButtonModel = pathCollection.models[pathCollection.length - 2];
      } else {
        return this.backButtonModel = {};
      }
    };

    Controller.prototype.getBackButton = function() {
      var backView;
      if (this.backButtonModel.attributes) {
        console.log('back');
        backView = new List.Back({
          model: this.backButtonModel
        });
        this.folderLayout.regionBack.show(backView);
        return this.listenTo(backView, 'folder:open', (function(_this) {
          return function(model) {
            return _this.getFolder(model.model);
          };
        })(this));
      } else {
        return this.folderLayout.regionBack.empty();
      }
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("BrowserApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.ListLayout = (function(_super) {
    __extends(ListLayout, _super);

    function ListLayout() {
      return ListLayout.__super__.constructor.apply(this, arguments);
    }

    ListLayout.prototype.className = "browser-page";

    return ListLayout;

  })(App.Views.LayoutWithSidebarFirstView);

  /*
    Sources
   */
  List.Source = (function(_super) {
    __extends(Source, _super);

    function Source() {
      return Source.__super__.constructor.apply(this, arguments);
    }

    Source.prototype.template = 'apps/browser/list/source';

    Source.prototype.tagName = 'li';

    Source.prototype.triggers = {
      'click .source': 'source:open'
    };

    return Source;

  })(App.Views.ItemView);
  List.Sources = (function(_super) {
    __extends(Sources, _super);

    function Sources() {
      return Sources.__super__.constructor.apply(this, arguments);
    }

    Sources.prototype.template = 'apps/browser/list/source_set';

    Sources.prototype.childView = List.Source;

    Sources.prototype.tagName = "div";

    Sources.prototype.childViewContainer = 'ul.sources';

    Sources.prototype.className = "source-set";

    Sources.prototype.initialize = function() {
      return this.collection = this.model.get('sources');
    };

    return Sources;

  })(App.Views.CompositeView);
  List.SourcesSet = (function(_super) {
    __extends(SourcesSet, _super);

    function SourcesSet() {
      return SourcesSet.__super__.constructor.apply(this, arguments);
    }

    SourcesSet.prototype.childView = List.Sources;

    SourcesSet.prototype.tagName = "div";

    SourcesSet.prototype.className = "sources-sets";

    return SourcesSet;

  })(App.Views.CollectionView);

  /*
    Folder
   */
  List.FolderLayout = (function(_super) {
    __extends(FolderLayout, _super);

    function FolderLayout() {
      return FolderLayout.__super__.constructor.apply(this, arguments);
    }

    FolderLayout.prototype.template = 'apps/browser/list/folder_layout';

    FolderLayout.prototype.className = "folder-page-wrapper";

    FolderLayout.prototype.regions = {
      regionPath: '.path',
      regionFolders: '.folders',
      regionFiles: '.files',
      regionBack: '.back'
    };

    return FolderLayout;

  })(App.Views.LayoutView);
  List.Item = (function(_super) {
    __extends(Item, _super);

    function Item() {
      return Item.__super__.constructor.apply(this, arguments);
    }

    Item.prototype.template = 'apps/browser/list/file';

    Item.prototype.tagName = 'li';

    return Item;

  })(App.Views.ItemView);
  List.Folder = (function(_super) {
    __extends(Folder, _super);

    function Folder() {
      return Folder.__super__.constructor.apply(this, arguments);
    }

    Folder.prototype.className = 'folder';

    Folder.prototype.triggers = {
      'click .title': 'folder:open',
      'click .play': 'folder:play'
    };

    return Folder;

  })(List.Item);
  List.File = (function(_super) {
    __extends(File, _super);

    function File() {
      return File.__super__.constructor.apply(this, arguments);
    }

    File.prototype.className = 'file';

    File.prototype.triggers = {
      'click .play': 'file:play'
    };

    return File;

  })(List.Item);
  List.FolderList = (function(_super) {
    __extends(FolderList, _super);

    function FolderList() {
      return FolderList.__super__.constructor.apply(this, arguments);
    }

    FolderList.prototype.tagName = 'ul';

    FolderList.prototype.childView = List.Folder;

    return FolderList;

  })(App.Views.CollectionView);
  List.FileList = (function(_super) {
    __extends(FileList, _super);

    function FileList() {
      return FileList.__super__.constructor.apply(this, arguments);
    }

    FileList.prototype.tagName = 'ul';

    FileList.prototype.childView = List.File;

    return FileList;

  })(App.Views.CollectionView);

  /*
    Path
   */
  List.Path = (function(_super) {
    __extends(Path, _super);

    function Path() {
      return Path.__super__.constructor.apply(this, arguments);
    }

    Path.prototype.template = 'apps/browser/list/path';

    Path.prototype.tagName = 'li';

    Path.prototype.triggers = {
      'click .title': 'folder:open'
    };

    return Path;

  })(App.Views.ItemView);
  List.PathList = (function(_super) {
    __extends(PathList, _super);

    function PathList() {
      return PathList.__super__.constructor.apply(this, arguments);
    }

    PathList.prototype.tagName = 'ul';

    PathList.prototype.childView = List.Path;

    return PathList;

  })(App.Views.CollectionView);
  return List.Back = (function(_super) {
    __extends(Back, _super);

    function Back() {
      return Back.__super__.constructor.apply(this, arguments);
    }

    Back.prototype.template = 'apps/browser/list/back_button';

    Back.prototype.tagName = 'div';

    Back.prototype.className = 'back-button';

    Back.prototype.triggers = {
      'click .title': 'folder:open'
    };

    return Back;

  })(App.Views.ItemView);
});

this.Kodi.module("CommandApp", function(CommandApp, App, Backbone, Marionette, $, _) {

  /*
    Kodi.
   */
  App.reqres.setHandler("command:kodi:player", function(method, params, callback) {
    var commander;
    commander = new CommandApp.Kodi.Player('auto');
    return commander.sendCommand(method, params, callback);
  });
  App.reqres.setHandler("command:kodi:controller", function(media, controller) {
    if (media == null) {
      media = 'auto';
    }
    return new CommandApp.Kodi[controller](media);
  });
  return App.addInitializer(function() {});
});

this.Kodi.module("CommandApp.Kodi", function(Api, App, Backbone, Marionette, $, _) {
  return Api.Base = (function(_super) {
    __extends(Base, _super);

    function Base() {
      return Base.__super__.constructor.apply(this, arguments);
    }

    Base.prototype.ajaxOptions = {};

    Base.prototype.initialize = function(options) {
      if (options == null) {
        options = {};
      }
      $.jsonrpc.defaultUrl = config.get('static', 'jsonRpcEndpoint');
      return this.setOptions(options);
    };

    Base.prototype.setOptions = function(options) {
      return this.ajaxOptions = options;
    };

    Base.prototype.multipleCommands = function(commands, callback) {
      var obj;
      obj = $.jsonrpc(commands, this.ajaxOptions);
      obj.fail((function(_this) {
        return function(error) {
          return _this.onError(commands, error);
        };
      })(this));
      obj.done((function(_this) {
        return function(response) {
          response = _this.parseResponse(commands, response);
          _this.triggerMethod("response:ready", response);
          if (callback != null) {
            return _this.doCallback(callback, response);
          }
        };
      })(this));
      return obj;
    };

    Base.prototype.singleCommand = function(command, params, callback) {
      var obj;
      command = {
        method: command
      };
      if ((params != null) && params.length > 0) {
        command.params = params;
      }
      obj = this.multipleCommands([command], callback);
      return obj;
    };

    Base.prototype.parseResponse = function(commands, response) {
      var i, result, results;
      results = [];
      for (i in response) {
        result = response[i];
        if (result.result || result.result === false) {
          results.push(result.result);
        } else {
          this.onError(commands[i], result);
        }
      }
      if (commands.length === 1 && results.length === 1) {
        results = results[0];
      }
      return results;
    };

    Base.prototype.paramObj = function(key, val) {
      return helpers.global.paramObj(key, val);
    };

    Base.prototype.doCallback = function(callback, response) {
      if (callback != null) {
        return callback(response);
      }
    };

    Base.prototype.onError = function(commands, error) {
      return helpers.debug.rpcError(commands, error);
    };

    return Base;

  })(Marionette.Object);
});

this.Kodi.module("CommandApp.Kodi", function(Api, App, Backbone, Marionette, $, _) {
  Api.Commander = (function(_super) {
    __extends(Commander, _super);

    function Commander() {
      return Commander.__super__.constructor.apply(this, arguments);
    }

    Commander.prototype.playerActive = 0;

    Commander.prototype.playerName = 'music';

    Commander.prototype.playerForced = false;

    Commander.prototype.playerIds = {
      audio: 0,
      video: 1
    };

    Commander.prototype.setPlayer = function(player) {
      if (player === 'audio' || player === 'video') {
        this.playerActive = this.playerIds[player];
        this.playerName = player;
        return this.playerForced = true;
      }
    };

    Commander.prototype.getPlayer = function() {
      return this.playerActive;
    };

    Commander.prototype.getPlayerName = function() {
      return this.playerName;
    };

    Commander.prototype.playerIdToName = function(playerId) {
      playerName;
      var id, name, playerName, _ref;
      _ref = this.playerIds;
      for (name in _ref) {
        id = _ref[name];
        if (id === playerId) {
          playerName = name;
        }
      }
      return playerName;
    };

    Commander.prototype.commandNameSpace = 'JSONRPC';

    Commander.prototype.getCommand = function(command, namespace) {
      if (namespace == null) {
        namespace = this.commandNameSpace;
      }
      return namespace + '.' + command;
    };

    Commander.prototype.sendCommand = function(command, params, callback) {
      return this.singleCommand(this.getCommand(command), params, (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    return Commander;

  })(Api.Base);
  Api.Player = (function(_super) {
    __extends(Player, _super);

    function Player() {
      return Player.__super__.constructor.apply(this, arguments);
    }

    Player.prototype.commandNameSpace = 'Player';

    Player.prototype.playlistApi = {};

    Player.prototype.initialize = function(media) {
      if (media == null) {
        media = 'audio';
      }
      this.setPlayer(media);
      return this.playlistApi = App.request("playlist:kodi:entity:api");
    };

    Player.prototype.getParams = function(params, callback) {
      var defaultParams;
      if (params == null) {
        params = [];
      }
      if (this.playerForced) {
        defaultParams = [this.playerActive];
        return this.doCallback(callback, defaultParams.concat(params));
      } else {
        return this.getActivePlayers((function(_this) {
          return function(activeId) {
            defaultParams = [activeId];
            return _this.doCallback(callback, defaultParams.concat(params));
          };
        })(this));
      }
    };

    Player.prototype.getActivePlayers = function(callback) {
      return this.singleCommand(this.getCommand("GetActivePlayers"), {}, (function(_this) {
        return function(resp) {
          if (resp.length > 0) {
            _this.playerActive = resp[0].playerid;
            _this.playerName = _this.playerIdToName(_this.playerActive);
            _this.triggerMethod("player:ready", _this.playerActive);
            return _this.doCallback(callback, _this.playerActive);
          } else {
            return _this.doCallback(callback, _this.playerActive);
          }
        };
      })(this));
    };

    Player.prototype.sendCommand = function(command, params, callback) {
      if (params == null) {
        params = [];
      }
      return this.getParams(params, (function(_this) {
        return function(playerParams) {
          return _this.singleCommand(_this.getCommand(command), playerParams, function(resp) {
            return _this.doCallback(callback, resp);
          });
        };
      })(this));
    };

    Player.prototype.playEntity = function(type, value, options, callback) {
      var data, params;
      if (options == null) {
        options = {};
      }
      params = [];
      data = this.paramObj(type, value);
      if (type === 'position') {
        data.playlistid = this.getPlayer();
      }
      params.push(data);
      if (options.length > 0) {
        params.push(options);
      }
      return this.singleCommand(this.getCommand('Open', 'Player'), params, (function(_this) {
        return function(resp) {
          if (!App.request('sockets:active')) {
            App.request('state:kodi:update');
          }
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    Player.prototype.getPlaying = function(callback) {
      var obj;
      obj = {
        active: false,
        properties: false,
        item: false
      };
      return this.singleCommand(this.getCommand('GetActivePlayers'), {}, (function(_this) {
        return function(resp) {
          var commands, itemFields, playerFields;
          if (resp.length > 0) {
            obj.active = resp[0];
            commands = [];
            itemFields = helpers.entities.getFields(_this.playlistApi.fields, 'full');
            playerFields = ["playlistid", "speed", "position", "totaltime", "time", "percentage", "shuffled", "repeat", "canrepeat", "canshuffle", "canseek", "partymode"];
            commands.push({
              method: _this.getCommand('GetProperties'),
              params: [obj.active.playerid, playerFields]
            });
            commands.push({
              method: _this.getCommand('GetItem'),
              params: [obj.active.playerid, itemFields]
            });
            return _this.multipleCommands(commands, function(playing) {
              obj.properties = playing[0];
              obj.item = playing[1].item;
              return _this.doCallback(callback, obj);
            });
          } else {
            return _this.doCallback(callback, false);
          }
        };
      })(this));
    };

    return Player;

  })(Api.Commander);
  return Api.Application = (function(_super) {
    __extends(Application, _super);

    function Application() {
      return Application.__super__.constructor.apply(this, arguments);
    }

    Application.prototype.commandNameSpace = 'Application';

    Application.prototype.getProperties = function(callback) {
      return this.singleCommand(this.getCommand('GetProperties'), [["volume", "muted"]], (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    Application.prototype.setVolume = function(volume, callback) {
      return this.singleCommand(this.getCommand('SetVolume'), [volume], (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    Application.prototype.toggleMute = function(callback) {
      var stateObj;
      stateObj = App.request("state:kodi");
      return this.singleCommand(this.getCommand('SetMute'), [!stateObj.getState('muted')], (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    return Application;

  })(Api.Commander);
});

this.Kodi.module("CommandApp.Kodi", function(Api, App, Backbone, Marionette, $, _) {
  return Api.Input = (function(_super) {
    __extends(Input, _super);

    function Input() {
      return Input.__super__.constructor.apply(this, arguments);
    }

    Input.prototype.commandNameSpace = 'Input';

    Input.prototype.sendText = function(text, callback) {
      return this.singleCommand(this.getCommand('SendText'), [text], (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    Input.prototype.sendInput = function(type) {
      return this.singleCommand(this.getCommand('type'), [], (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    return Input;

  })(Api.Commander);
});

this.Kodi.module("CommandApp.Kodi", function(Api, App, Backbone, Marionette, $, _) {
  return Api.PlayList = (function(_super) {
    __extends(PlayList, _super);

    function PlayList() {
      return PlayList.__super__.constructor.apply(this, arguments);
    }

    PlayList.prototype.commandNameSpace = 'Playlist';

    PlayList.prototype.play = function(type, value) {
      var stateObj;
      stateObj = App.request("state:kodi");
      if (stateObj.isPlaying()) {
        return this.insertAndPlay(type, value, stateObj.getPlaying('position') + 1);
      } else {
        return this.clear((function(_this) {
          return function() {
            return _this.insertAndPlay(type, value, 0);
          };
        })(this));
      }
    };

    PlayList.prototype.add = function(type, value) {
      return this.playlistSize((function(_this) {
        return function(size) {
          return _this.insert(type, value, size);
        };
      })(this));
    };

    PlayList.prototype.remove = function(position, callback) {
      return this.singleCommand(this.getCommand('Remove'), [this.getPlayer(), parseInt(position)], (function(_this) {
        return function(resp) {
          _this.refreshPlaylistView();
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    PlayList.prototype.clear = function(callback) {
      return this.singleCommand(this.getCommand('Clear'), [this.getPlayer()], (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    PlayList.prototype.insert = function(type, value, position, callback) {
      if (position == null) {
        position = 0;
      }
      return this.singleCommand(this.getCommand('Insert'), [this.getPlayer(), parseInt(position), this.paramObj(type, value)], (function(_this) {
        return function(resp) {
          _this.refreshPlaylistView();
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    PlayList.prototype.getItems = function(callback) {
      return this.singleCommand(this.getCommand('GetItems'), [this.getPlayer(), ['title']], (function(_this) {
        return function(resp) {
          return _this.doCallback(callback, resp);
        };
      })(this));
    };

    PlayList.prototype.insertAndPlay = function(type, value, position, callback) {
      if (position == null) {
        position = 0;
      }
      return this.insert(type, value, position, (function(_this) {
        return function(resp) {
          return _this.playEntity('position', parseInt(position), {}, function() {
            return _this.doCallback(callback, resp);
          });
        };
      })(this));
    };

    PlayList.prototype.playlistSize = function(callback) {
      return this.getItems((function(_this) {
        return function(resp) {
          var position;
          position = resp.items != null ? resp.items.length : 0;
          return _this.doCallback(callback, position);
        };
      })(this));
    };

    PlayList.prototype.refreshPlaylistView = function() {
      var wsActive;
      wsActive = App.request("sockets:active");
      if (!wsActive) {
        return App.execute("playlist:refresh", 'kodi', this.playerName);
      }
    };

    return PlayList;

  })(Api.Player);
});

this.Kodi.module("FilterApp", function(FilterApp, App, Backbone, Marionette, $, _) {
  var API;
  API = {

    /*
      Settings/fields
     */
    sortFields: [
      {
        alias: 'Title',
        type: 'string',
        defaultSort: true,
        defaultOrder: 'asc',
        key: 'title'
      }, {
        alias: 'Artist',
        type: 'string',
        defaultSort: true,
        defaultOrder: 'asc',
        key: 'artist'
      }, {
        alias: 'Album',
        type: 'string',
        defaultSort: true,
        defaultOrder: 'asc',
        key: 'album'
      }, {
        alias: 'Year',
        type: 'number',
        key: 'year',
        defaultOrder: 'desc'
      }, {
        alias: 'Date Added',
        type: 'string',
        key: 'dateadded',
        defaultOrder: 'desc'
      }, {
        alias: 'Rating',
        type: 'float',
        key: 'rating',
        defaultOrder: 'desc'
      }
    ],
    filterFields: [
      {
        alias: 'Year',
        type: 'number',
        key: 'year',
        sortOrder: 'desc',
        filterCallback: 'multiple'
      }, {
        alias: 'Genre',
        type: 'array',
        key: 'genre',
        sortOrder: 'asc',
        filterCallback: 'multiple'
      }, {
        alias: 'Mood',
        type: 'array',
        key: 'mood',
        sortOrder: 'asc',
        filterCallback: 'multiple'
      }, {
        alias: 'Style',
        type: 'array',
        key: 'style',
        sortOrder: 'asc',
        filterCallback: 'multiple'
      }, {
        alias: 'Unwatched',
        type: "boolean",
        key: 'unwatchedShows',
        sortOrder: 'asc',
        filterCallback: 'unwatchedShows'
      }
    ],
    getFilterFields: function(type) {
      var available, availableFilters, field, fields, key, ret, _i, _len;
      key = type + 'Fields';
      fields = API[key];
      availableFilters = API.getAvailable();
      available = availableFilters[type];
      ret = [];
      for (_i = 0, _len = fields.length; _i < _len; _i++) {
        field = fields[_i];
        if (helpers.global.inArray(field.key, available)) {
          ret.push(field);
        }
      }
      return ret;
    },

    /*
      Storage
     */
    storeFiltersNamespace: 'filter:store:',
    getStoreNameSpace: function(type) {
      return API.storeFiltersNamespace + type;
    },
    setStoreFilters: function(filters, type) {
      var store;
      if (filters == null) {
        filters = {};
      }
      if (type == null) {
        type = 'filters';
      }
      store = {};
      store[helpers.url.path()] = filters;
      helpers.cache.set(API.getStoreNameSpace(type), store);
      return App.vent.trigger('filter:changed', filters);
    },
    getStoreFilters: function(type) {
      var filters, path, store;
      if (type == null) {
        type = 'filters';
      }
      store = helpers.cache.get(API.getStoreNameSpace(type), {});
      path = helpers.url.path();
      filters = store[path] ? store[path] : {};
      return filters;
    },
    updateStoreFiltersKey: function(key, values) {
      var filters;
      if (values == null) {
        values = [];
      }
      filters = API.getStoreFilters();
      filters[key] = values;
      API.setStoreFilters(filters);
      return filters;
    },
    getStoreFiltersKey: function(key) {
      var filter, filters;
      filters = API.getStoreFilters();
      filter = filters[key] ? filters[key] : [];
      return filter;
    },
    setStoreSort: function(method, order) {
      var sort;
      if (order == null) {
        order = 'asc';
      }
      sort = {
        method: method,
        order: order
      };
      return API.setStoreFilters(sort, 'sort');
    },
    getStoreSort: function() {
      var defaults, sort;
      sort = API.getStoreFilters('sort');
      if (!sort.method) {
        defaults = _.findWhere(API.getFilterFields('sort'), {
          defaultSort: true
        });
        sort = {
          method: defaults.key,
          order: defaults.defaultOrder
        };
      }
      return sort;
    },
    setAvailable: function(available) {
      return API.setStoreFilters(available, 'available');
    },
    getAvailable: function() {
      return API.getStoreFilters('available');
    },

    /*
      Parsing
     */
    toggleOrder: function(order) {
      order = order === 'asc' ? 'desc' : 'asc';
      return order;
    },
    parseSortable: function(items) {
      var i, item, params;
      params = API.getStoreSort(false, 'asc');
      for (i in items) {
        item = items[i];
        items[i].active = false;
        items[i].order = item.defaultOrder;
        if (params.method && item.key === params.method) {
          items[i].active = true;
          items[i].order = this.toggleOrder(params.order);
        } else if (item.defaultSort && params.method === false) {
          items[i].active = true;
        }
      }
      return items;
    },
    parseFilterable: function(items) {
      var active, activeItem, i, val;
      active = API.getFilterActive();
      for (i in items) {
        val = items[i];
        activeItem = _.findWhere(active, {
          key: val.key
        });
        items[i].active = activeItem !== void 0;
      }
      return items;
    },
    getFilterOptions: function(key, collection) {
      var items, values;
      values = App.request('filter:store:key:get', key);
      items = [];
      _.map(_.uniq(_.flatten(collection.pluck(key))), function(val) {
        return items.push({
          key: key,
          value: val,
          active: helpers.global.inArray(val, values)
        });
      });
      return items;
    },

    /*
      Apply filters
     */
    applyFilters: function(collection) {
      var filteredCollection, key, sort, values, _ref;
      sort = API.getStoreSort();
      collection.sortCollection(sort.method, sort.order);
      filteredCollection = new App.Entities.Filtered(collection);
      _ref = API.getStoreFilters();
      for (key in _ref) {
        values = _ref[key];
        if (values.length > 0) {
          filteredCollection = API.applyFilter(filteredCollection, key, values);
        }
      }
      return filteredCollection;
    },
    applyFilter: function(collection, key, vals) {
      var s;
      s = API.getFilterSettings(key);
      switch (s.filterCallback) {
        case 'multiple':
          if (s.type !== 'array') {
            collection.filterByMultiple(key, vals);
          } else {
            collection.filterByMultipleArray(key, vals);
          }
          break;
        case 'unwatchedShows':
          collection.filterByUnwatchedShows();
          break;
        default:
          collection;
      }
      return collection;
    },
    getFilterSettings: function(key) {
      return _.findWhere(API.getFilterFields('filter'), {
        key: key
      });
    },
    getFilterActive: function() {
      var items, key, values, _ref;
      items = [];
      _ref = API.getStoreFilters();
      for (key in _ref) {
        values = _ref[key];
        if (values.length > 0) {
          items.push({
            key: key,
            values: values
          });
        }
      }
      return items;
    }
  };

  /*
    Handlers.
   */
  App.reqres.setHandler('filter:show', function(collection) {
    var filters, view;
    API.setAvailable(collection.availableFilters);
    filters = new FilterApp.Show.Controller({
      refCollection: collection
    });
    view = filters.getFilterView();
    return view;
  });
  App.reqres.setHandler('filter:options', function(key, collection) {
    var filterSettings, options, optionsCollection;
    options = API.getFilterOptions(key, collection);
    optionsCollection = App.request('filter:filters:options:entities', options);
    filterSettings = API.getFilterSettings(key);
    optionsCollection.sortCollection('value', filterSettings.sortOrder);
    return optionsCollection;
  });
  App.reqres.setHandler('filter:active', function() {
    return App.request('filter:active:entities', API.getFilterActive());
  });
  App.reqres.setHandler('filter:apply:entites', function(collection) {
    API.setAvailable(collection.availableFilters);
    return API.applyFilters(collection);
  });
  App.reqres.setHandler('filter:sortable:entities', function() {
    return App.request('filter:sort:entities', API.parseSortable(API.getFilterFields('sort')));
  });
  App.reqres.setHandler('filter:filterable:entities', function() {
    return App.request('filter:filters:entities', API.parseFilterable(API.getFilterFields('filter')));
  });
  App.reqres.setHandler('filter:store:set', function(filters) {
    API.setStoreFilters(filters);
    return filters;
  });
  App.reqres.setHandler('filter:store:get', function() {
    return API.getStoreFilters();
  });
  App.reqres.setHandler('filter:store:key:get', function(key) {
    return API.getStoreFiltersKey(key);
  });
  App.reqres.setHandler('filter:store:key:update', function(key, values) {
    if (values == null) {
      values = [];
    }
    return API.updateStoreFiltersKey(key, values);
  });
  App.reqres.setHandler('filter:store:key:toggle', function(key, value) {
    var i, newValues, ret, values, _i, _len;
    values = API.getStoreFiltersKey(key);
    ret = [];
    if (_.indexOf(values, value) > -1) {
      newValues = [];
      for (_i = 0, _len = values.length; _i < _len; _i++) {
        i = values[_i];
        if (i !== value) {
          newValues.push(i);
        }
      }
      ret = newValues;
    } else {
      values.push(value);
      ret = values;
    }
    API.updateStoreFiltersKey(key, ret);
    return ret;
  });
  App.reqres.setHandler('filter:sort:store:set', function(method, order) {
    if (order == null) {
      order = 'asc';
    }
    return API.setStoreSort(method, order);
  });
  return App.reqres.setHandler('filter:sort:store:get', function() {
    return API.getStoreSort();
  });
});

this.Kodi.module("FilterApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  return Show.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.getFilterView = function() {
      var collection;
      collection = this.getOption('refCollection');
      this.layoutFilters = this.getLayoutView(collection);
      this.listenTo(this.layoutFilters, "show", (function(_this) {
        return function() {
          _this.getSort();
          _this.getFilters();
          _this.getActive();
          return _this.getSections();
        };
      })(this));
      this.listenTo(this.layoutFilters, 'filter:layout:close:filters', (function(_this) {
        return function() {
          return _this.stateChange('normal');
        };
      })(this));
      this.listenTo(this.layoutFilters, 'filter:layout:close:options', (function(_this) {
        return function() {
          return _this.stateChange('filters');
        };
      })(this));
      this.listenTo(this.layoutFilters, 'filter:layout:open:filters', (function(_this) {
        return function() {
          return _this.stateChange('filters');
        };
      })(this));
      this.listenTo(this.layoutFilters, 'filter:layout:open:options', (function(_this) {
        return function() {
          return _this.stateChange('options');
        };
      })(this));
      return this.layoutFilters;
    };

    Controller.prototype.getLayoutView = function(collection) {
      return new Show.FilterLayout({
        collection: collection
      });
    };

    Controller.prototype.getSort = function() {
      var sortCollection, sortView;
      sortCollection = App.request('filter:sortable:entities');
      sortView = new Show.SortList({
        collection: sortCollection
      });
      this.layoutFilters.regionSort.show(sortView);
      return App.listenTo(sortView, "childview:filter:sortable:select", (function(_this) {
        return function(parentview, childview) {
          App.request('filter:sort:store:set', childview.model.get('key'), childview.model.get('order'));
          _this.layoutFilters.trigger('filter:changed');
          return _this.getSort();
        };
      })(this));
    };

    Controller.prototype.getFilters = function(clearOptions) {
      var filterCollection, filtersView;
      if (clearOptions == null) {
        clearOptions = true;
      }
      filterCollection = App.request('filter:filterable:entities');
      filtersView = new Show.FilterList({
        collection: filterCollection
      });
      App.listenTo(filtersView, "childview:filter:filterable:select", (function(_this) {
        return function(parentview, childview) {
          var key;
          key = childview.model.get('key');
          if (childview.model.get('type') === 'boolean') {
            App.request('filter:store:key:toggle', key, childview.model.get('alias'));
            return _this.triggerChange();
          } else {
            _this.getFilterOptions(key);
            return _this.stateChange('options');
          }
        };
      })(this));
      this.layoutFilters.regionFiltersList.show(filtersView);
      if (clearOptions) {
        return this.layoutFilters.regionFiltersOptions.empty();
      }
    };

    Controller.prototype.getActive = function() {
      var activeCollection, optionsView;
      activeCollection = App.request('filter:active');
      optionsView = new Show.ActiveList({
        collection: activeCollection
      });
      this.layoutFilters.regionFiltersActive.show(optionsView);
      App.listenTo(optionsView, "childview:filter:option:remove", (function(_this) {
        return function(parentview, childview) {
          var key;
          key = childview.model.get('key');
          App.request('filter:store:key:update', key, []);
          return _this.triggerChange();
        };
      })(this));
      return App.listenTo(optionsView, "childview:filter:add", (function(_this) {
        return function(parentview, childview) {
          return _this.stateChange('filters');
        };
      })(this));
    };

    Controller.prototype.getFilterOptions = function(key) {
      var optionsCollection, optionsView;
      optionsCollection = App.request('filter:options', key, this.getOption('refCollection'));
      optionsView = new Show.OptionList({
        collection: optionsCollection
      });
      this.layoutFilters.regionFiltersOptions.show(optionsView);
      return App.listenTo(optionsView, "childview:filter:option:select", (function(_this) {
        return function(parentview, childview) {
          var value;
          value = childview.model.get('value');
          childview.view.$el.find('.option').toggleClass('active');
          App.request('filter:store:key:toggle', key, value);
          return _this.triggerChange(false);
        };
      })(this));
    };

    Controller.prototype.triggerChange = function(clearOptions) {
      if (clearOptions == null) {
        clearOptions = true;
      }
      this.getFilters(clearOptions);
      this.getActive();
      return this.layoutFilters.trigger('filter:changed');
    };

    Controller.prototype.stateChange = function(state) {
      var $wrapper;
      if (state == null) {
        state = 'normal';
      }
      $wrapper = this.layoutFilters.$el.find('.filters-container');
      switch (state) {
        case 'filters':
          return $wrapper.removeClass('show-options').addClass('show-filters');
        case 'options':
          return $wrapper.addClass('show-options').removeClass('show-filters');
        default:
          return $wrapper.removeClass('show-options').removeClass('show-filters');
      }
    };

    Controller.prototype.getSections = function() {
      var collection, nav;
      collection = this.getOption('refCollection');
      if (collection.sectionId) {
        nav = App.request("navMain:children:show", collection.sectionId, 'Sections');
        return this.layoutFilters.regionNavSection.show(nav);
      }
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("FilterApp.Show", function(Show, App, Backbone, Marionette, $, _) {

  /*
    Base.
   */
  Show.FilterLayout = (function(_super) {
    __extends(FilterLayout, _super);

    function FilterLayout() {
      return FilterLayout.__super__.constructor.apply(this, arguments);
    }

    FilterLayout.prototype.template = 'apps/filter/show/filters_ui';

    FilterLayout.prototype.className = "side-bar";

    FilterLayout.prototype.regions = {
      regionSort: '.sort-options',
      regionFiltersActive: '.filters-active',
      regionFiltersList: '.filters-list',
      regionFiltersOptions: '.filter-options-list',
      regionNavSection: '.nav-section'
    };

    FilterLayout.prototype.triggers = {
      'click .close-filters': 'filter:layout:close:filters',
      'click .close-options': 'filter:layout:close:options',
      'click .open-filters': 'filter:layout:open:filters'
    };

    return FilterLayout;

  })(App.Views.LayoutView);
  Show.ListItem = (function(_super) {
    __extends(ListItem, _super);

    function ListItem() {
      return ListItem.__super__.constructor.apply(this, arguments);
    }

    ListItem.prototype.template = 'apps/filter/show/list_item';

    ListItem.prototype.tagName = 'li';

    return ListItem;

  })(App.Views.ItemView);
  Show.List = (function(_super) {
    __extends(List, _super);

    function List() {
      return List.__super__.constructor.apply(this, arguments);
    }

    List.prototype.childView = Show.ListItem;

    List.prototype.tagName = "ul";

    List.prototype.className = "selection-list";

    return List;

  })(App.Views.CollectionView);

  /*
    Extends.
   */
  Show.SortListItem = (function(_super) {
    __extends(SortListItem, _super);

    function SortListItem() {
      return SortListItem.__super__.constructor.apply(this, arguments);
    }

    SortListItem.prototype.triggers = {
      "click .sortable": "filter:sortable:select"
    };

    SortListItem.prototype.initialize = function() {
      var classes, tag;
      classes = ['option', 'sortable'];
      if (this.model.get('active') === true) {
        classes.push('active');
      }
      classes.push('order-' + this.model.get('order'));
      tag = this.themeTag('span', {
        'class': classes.join(' ')
      }, this.model.get('alias'));
      return this.model.set({
        title: tag
      });
    };

    return SortListItem;

  })(Show.ListItem);
  Show.SortList = (function(_super) {
    __extends(SortList, _super);

    function SortList() {
      return SortList.__super__.constructor.apply(this, arguments);
    }

    SortList.prototype.childView = Show.SortListItem;

    return SortList;

  })(Show.List);
  Show.FilterListItem = (function(_super) {
    __extends(FilterListItem, _super);

    function FilterListItem() {
      return FilterListItem.__super__.constructor.apply(this, arguments);
    }

    FilterListItem.prototype.triggers = {
      "click .filterable": "filter:filterable:select"
    };

    FilterListItem.prototype.initialize = function() {
      var classes, tag;
      classes = ['option', 'option filterable'];
      if (this.model.get('active')) {
        classes.push('active');
      }
      tag = this.themeTag('span', {
        'class': classes.join(' ')
      }, this.model.get('alias'));
      return this.model.set({
        title: tag
      });
    };

    return FilterListItem;

  })(Show.ListItem);
  Show.FilterList = (function(_super) {
    __extends(FilterList, _super);

    function FilterList() {
      return FilterList.__super__.constructor.apply(this, arguments);
    }

    FilterList.prototype.childView = Show.FilterListItem;

    return FilterList;

  })(Show.List);
  Show.OptionListItem = (function(_super) {
    __extends(OptionListItem, _super);

    function OptionListItem() {
      return OptionListItem.__super__.constructor.apply(this, arguments);
    }

    OptionListItem.prototype.triggers = {
      "click .filterable-option": "filter:option:select"
    };

    OptionListItem.prototype.initialize = function() {
      var classes, tag;
      classes = ['option', 'option filterable-option'];
      if (this.model.get('active')) {
        classes.push('active');
      }
      tag = this.themeTag('span', {
        'class': classes.join(' ')
      }, this.model.get('value'));
      return this.model.set({
        title: tag
      });
    };

    return OptionListItem;

  })(Show.ListItem);
  Show.OptionList = (function(_super) {
    __extends(OptionList, _super);

    function OptionList() {
      return OptionList.__super__.constructor.apply(this, arguments);
    }

    OptionList.prototype.activeValues = [];

    OptionList.prototype.childView = Show.OptionListItem;

    return OptionList;

  })(Show.List);
  Show.ActiveListItem = (function(_super) {
    __extends(ActiveListItem, _super);

    function ActiveListItem() {
      return ActiveListItem.__super__.constructor.apply(this, arguments);
    }

    ActiveListItem.prototype.triggers = {
      "click .filterable-remove": "filter:option:remove"
    };

    ActiveListItem.prototype.initialize = function() {
      var tag, text, tooltip;
      tooltip = t.gettext('Remove') + ' ' + t.gettext(this.model.get('key')) + ' ' + t.gettext('filter');
      text = this.themeTag('span', {
        'class': 'text'
      }, this.model.get('values').join(', '));
      tag = this.themeTag('span', {
        'class': 'filter-btn filterable-remove',
        title: tooltip
      }, text);
      return this.model.set({
        title: tag
      });
    };

    return ActiveListItem;

  })(Show.ListItem);
  Show.ActiveNewListItem = (function(_super) {
    __extends(ActiveNewListItem, _super);

    function ActiveNewListItem() {
      return ActiveNewListItem.__super__.constructor.apply(this, arguments);
    }

    ActiveNewListItem.prototype.triggers = {
      "click .filterable-add": "filter:add"
    };

    ActiveNewListItem.prototype.initialize = function() {
      var tag;
      tag = this.themeTag('span', {
        'class': 'filter-btn filterable-add'
      }, t.gettext('Add Filter'));
      return this.model.set({
        title: tag
      });
    };

    return ActiveNewListItem;

  })(Show.ListItem);
  return Show.ActiveList = (function(_super) {
    __extends(ActiveList, _super);

    function ActiveList() {
      return ActiveList.__super__.constructor.apply(this, arguments);
    }

    ActiveList.prototype.childView = Show.ActiveListItem;

    ActiveList.prototype.emptyView = Show.ActiveNewListItem;

    ActiveList.prototype.className = "active-list";

    return ActiveList;

  })(Show.List);
});

this.Kodi.module("Images", function(Images, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    imagesPath: 'dist/images/',
    defaultFanartPath: 'fanart_default/',
    defaultFanartFiles: ['wallpaper-443657.jpg', 'wallpaper-45040.jpg', 'wallpaper-765190.jpg', 'wallpaper-84050.jpg'],
    getDefaultThumbnail: function() {
      return API.imagesPath + 'thumbnail_default.png';
    },
    getRandomFanart: function() {
      var file, path, rand;
      rand = helpers.global.getRandomInt(0, API.defaultFanartFiles.length - 1);
      file = API.defaultFanartFiles[rand];
      path = API.imagesPath + API.defaultFanartPath + file;
      return path;
    },
    parseRawPath: function(rawPath) {
      var path;
      path = 'image/' + encodeURIComponent(rawPath);
      return path;
    },
    setFanartBackground: function(path, region) {
      var $body;
      $body = App.getRegion(region).$el;
      if (path !== 'none') {
        if (!path) {
          path = this.getRandomFanart();
        }
        return $body.css('background-image', 'url(' + path + ')');
      } else {
        return $body.removeAttr('style');
      }
    },
    getImageUrl: function(rawPath, type) {
      var path;
      if (type == null) {
        type = 'thumbnail';
      }
      path = '';
      if ((rawPath == null) || rawPath === '') {
        switch (type) {
          case 'fanart':
            path = API.getRandomFanart();
            break;
          default:
            path = API.getDefaultThumbnail();
        }
      } else {
        path = API.parseRawPath(rawPath);
      }
      return path;
    }
  };
  App.commands.setHandler("images:fanart:set", function(path, region) {
    if (region == null) {
      region = 'regionFanart';
    }
    return API.setFanartBackground(path, region);
  });
  App.reqres.setHandler("images:path:get", function(rawPath, type) {
    if (rawPath == null) {
      rawPath = '';
    }
    if (type == null) {
      type = 'thumbnail';
    }
    return API.getImageUrl(rawPath, type);
  });
  return App.reqres.setHandler("images:path:entity", function(model) {
    if (model.thumbnail != null) {
      model.thumbnail = API.getImageUrl(model.thumbnail, 'thumbnail');
    }
    if (model.fanart != null) {
      model.fanart = API.getImageUrl(model.fanart, 'fanart');
    }
    return model;
  });
});

this.Kodi.module("InputApp", function(InputApp, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    getController: function() {
      return App.request("command:kodi:controller", 'auto', 'Input');
    }
  };
  return App.commands.setHandler("input:textbox", function(msg) {
    App.execute("ui:textinput:show", "Input required", msg, function(text) {
      API.getController().sendText(text);
      return App.execute("notification:show", t.gettext('Sent text') + ' "' + text + '" ' + t.gettext('to Kodi'));
    });
    return App.commands.setHandler("input:textbox:close", function() {
      return App.execute("ui:modal:close");
    });
  });
});

this.Kodi.module("LoadingApp", function(LoadingApp, App, Backbone, Marionette, $, _) {
  App.commands.setHandler("loading:show:page", function() {
    var page;
    page = new LoadingApp.Show.Page();
    return App.regionContent.show(page);
  });
  return App.commands.setHandler("loading:show:view", function(region) {
    var view;
    view = new LoadingApp.Show.Page();
    return region.show(view);
  });
});

this.Kodi.module("LoadingApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  return Show.Page = (function(_super) {
    __extends(Page, _super);

    function Page() {
      return Page.__super__.constructor.apply(this, arguments);
    }

    Page.prototype.template = "apps/loading/show/loading_page";

    return Page;

  })(Backbone.Marionette.ItemView);
});

this.Kodi.module("localPlaylistApp.List", function(List, App, Backbone, Marionette, $, _) {
  return List.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function(options) {
      var id, playlists;
      id = options.id;
      playlists = App.request("localplaylist:entities");
      this.layout = this.getLayoutView(playlists);
      this.listenTo(this.layout, "show", (function(_this) {
        return function() {
          _this.getListsView(playlists);
          return _this.getItems(id);
        };
      })(this));
      return App.regionContent.show(this.layout);
    };

    Controller.prototype.getLayoutView = function(collection) {
      return new List.ListLayout({
        collection: collection
      });
    };

    Controller.prototype.getListsView = function(playlists) {
      var view;
      view = new List.Lists({
        collection: playlists
      });
      return this.layout.regionSidebarFirst.show(view);
    };

    Controller.prototype.getItems = function(id) {
      var collection, media, playlist, view;
      playlist = App.request("localplaylist:entity", id);
      media = 'song';
      collection = App.request("localplaylist:item:entities", id);
      view = App.request("" + media + ":list:view", collection);
      return this.layout.regionContent.show(view);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("localPlaylistApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.ListLayout = (function(_super) {
    __extends(ListLayout, _super);

    function ListLayout() {
      return ListLayout.__super__.constructor.apply(this, arguments);
    }

    ListLayout.prototype.className = "local-playlist-list";

    return ListLayout;

  })(App.Views.LayoutWithSidebarFirstView);
  List.List = (function(_super) {
    __extends(List, _super);

    function List() {
      return List.__super__.constructor.apply(this, arguments);
    }

    List.prototype.template = 'apps/localPlaylist/list/playlist';

    List.prototype.tagName = "li";

    List.prototype.initialize = function() {
      var classes, path, tag;
      path = helpers.url.get('playlist', this.model.get('id'));
      classes = [];
      if (path === helpers.url.path()) {
        classes.push('active');
      }
      tag = this.themeLink(this.model.get('name'), path, {
        'className': classes.join(' ')
      });
      return this.model.set({
        title: tag
      });
    };

    return List;

  })(App.Views.ItemView);
  List.Lists = (function(_super) {
    __extends(Lists, _super);

    function Lists() {
      return Lists.__super__.constructor.apply(this, arguments);
    }

    Lists.prototype.template = 'apps/localPlaylist/list/playlist_list';

    Lists.prototype.childView = List.List;

    Lists.prototype.tagName = "div";

    Lists.prototype.childViewContainer = 'ul.lists';

    return Lists;

  })(App.Views.CompositeView);
  List.Selection = (function(_super) {
    __extends(Selection, _super);

    function Selection() {
      return Selection.__super__.constructor.apply(this, arguments);
    }

    Selection.prototype.template = 'apps/localPlaylist/list/playlist';

    Selection.prototype.tagName = "li";

    Selection.prototype.initialize = function() {
      return this.model.set({
        title: this.model.get('name')
      });
    };

    Selection.prototype.triggers = {
      'click .item': 'item:selected'
    };

    return Selection;

  })(App.Views.ItemView);
  return List.SelectionList = (function(_super) {
    __extends(SelectionList, _super);

    function SelectionList() {
      return SelectionList.__super__.constructor.apply(this, arguments);
    }

    SelectionList.prototype.template = 'apps/localPlaylist/list/playlist_list';

    SelectionList.prototype.childView = List.Selection;

    SelectionList.prototype.tagName = "div";

    SelectionList.prototype.childViewContainer = 'ul.lists';

    return SelectionList;

  })(App.Views.CompositeView);
});

this.Kodi.module("localPlaylistApp", function(localPlaylistApp, App, Backbone, Marionette, $, _) {
  var API;
  localPlaylistApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "playlists": "list",
      "playlist/:id": "list"
    };

    return Router;

  })(App.Router.Base);
  API = {
    list: function(id) {
      var item, items, lists;
      if (id === null) {
        lists = App.request("localplaylist:entities");
        items = lists.getRawCollection();
        if (_.isEmpty(lists)) {
          id = 0;
        } else {
          item = _.min(items, function(list) {
            return list.id;
          });
          id = item.id;
          App.navigate(helpers.url.get('playlist', id));
        }
      }
      return new localPlaylistApp.List.Controller({
        id: id
      });
    },
    addToList: function(entityType, id) {
      var $content, playlists, view;
      playlists = App.request("localplaylist:entities");
      view = new localPlaylistApp.List.SelectionList({
        collection: playlists
      });
      $content = view.render().$el;
      App.execute("ui:modal:show", 'Select a playlist', $content);
      return App.listenTo(view, 'childview:item:selected', function(list, item) {
        var collection, playlistId;
        playlistId = item.model.get('id');
        if (helpers.global.inArray(entityType, ['albumid', 'artistid', 'songid'])) {
          collection = App.request("song:filtered:entities", {
            filter: helpers.global.paramObj(entityType, id)
          });
          return App.execute("when:entity:fetched", collection, (function(_this) {
            return function() {
              App.request("localplaylist:item:add:entities", playlistId, collection);
              App.execute("ui:modal:close");
              return App.execute("notification:show", "Added to your playlist");
            };
          })(this));
        } else {

        }
      });
    }
  };
  App.on("before:start", function() {
    return new localPlaylistApp.Router({
      controller: API
    });
  });
  return App.commands.setHandler("playlistlocal:additems", function(entityType, id) {
    return API.addToList(entityType, id);
  });
});

this.Kodi.module("MovieApp.List", function(List, App, Backbone, Marionette, $, _) {
  return List.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function() {
      var collection;
      collection = App.request("movie:entities");
      return App.execute("when:entity:fetched", collection, (function(_this) {
        return function() {
          collection.availableFilters = _this.getAvailableFilters();
          collection.sectionId = 11;
          _this.layout = _this.getLayoutView(collection);
          _this.listenTo(_this.layout, "show", function() {
            _this.renderList(collection);
            return _this.getFiltersView(collection);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(collection) {
      return new List.ListLayout({
        collection: collection
      });
    };

    Controller.prototype.getMoviesView = function(collection) {
      var view;
      view = new List.Movies({
        collection: collection
      });
      this.listenTo(view, 'childview:movie:play', function(list, item) {
        var playlist;
        playlist = App.request("command:kodi:controller", 'video', 'PlayList');
        return playlist.play('movieid', item.model.get('movieid'));
      });
      return view;
    };

    Controller.prototype.getAvailableFilters = function() {
      return {
        sort: ['title', 'year', 'dateadded', 'rating'],
        filter: ['year', 'genre']
      };
    };

    Controller.prototype.getFiltersView = function(collection) {
      var filters;
      filters = App.request('filter:show', collection);
      this.layout.regionSidebarFirst.show(filters);
      return this.listenTo(filters, "filter:changed", (function(_this) {
        return function() {
          return _this.renderList(collection);
        };
      })(this));
    };

    Controller.prototype.renderList = function(collection) {
      var filteredCollection, view;
      App.execute("loading:show:view", this.layout.regionContent);
      filteredCollection = App.request('filter:apply:entites', collection);
      view = this.getMoviesView(filteredCollection);
      return this.layout.regionContent.show(view);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("MovieApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.ListLayout = (function(_super) {
    __extends(ListLayout, _super);

    function ListLayout() {
      return ListLayout.__super__.constructor.apply(this, arguments);
    }

    ListLayout.prototype.className = "movie-list";

    return ListLayout;

  })(App.Views.LayoutWithSidebarFirstView);
  List.MovieTeaser = (function(_super) {
    __extends(MovieTeaser, _super);

    function MovieTeaser() {
      return MovieTeaser.__super__.constructor.apply(this, arguments);
    }

    MovieTeaser.prototype.triggers = {
      "click .play": "movie:play",
      "click .menu": "movie-menu:clicked"
    };

    MovieTeaser.prototype.initialize = function() {
      return this.model.set({
        subtitle: this.model.get('year')
      });
    };

    return MovieTeaser;

  })(App.Views.CardView);
  List.Empty = (function(_super) {
    __extends(Empty, _super);

    function Empty() {
      return Empty.__super__.constructor.apply(this, arguments);
    }

    Empty.prototype.tagName = "li";

    Empty.prototype.className = "movie-empty-result";

    return Empty;

  })(App.Views.EmptyView);
  return List.Movies = (function(_super) {
    __extends(Movies, _super);

    function Movies() {
      return Movies.__super__.constructor.apply(this, arguments);
    }

    Movies.prototype.childView = List.MovieTeaser;

    Movies.prototype.emptyView = List.Empty;

    Movies.prototype.tagName = "ul";

    Movies.prototype.className = "card-grid--tall";

    return Movies;

  })(App.Views.CollectionView);
});

this.Kodi.module("MovieApp", function(MovieApp, App, Backbone, Marionette, $, _) {
  var API;
  MovieApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "movies": "list",
      "movie/:id": "view"
    };

    return Router;

  })(App.Router.Base);
  API = {
    list: function() {
      return new MovieApp.List.Controller();
    },
    view: function(id) {
      return new MovieApp.Show.Controller({
        id: id
      });
    }
  };
  return App.on("before:start", function() {
    return new MovieApp.Router({
      controller: API
    });
  });
});

this.Kodi.module("MovieApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  return Show.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function(options) {
      var id, movie;
      id = parseInt(options.id);
      movie = App.request("movie:entity", id);
      return App.execute("when:entity:fetched", movie, (function(_this) {
        return function() {
          App.execute("images:fanart:set", movie.get('fanart'));
          _this.layout = _this.getLayoutView(movie);
          _this.listenTo(_this.layout, "destroy", function() {
            return App.execute("images:fanart:set", 'none');
          });
          _this.listenTo(_this.layout, "show", function() {
            return _this.getDetailsLayoutView(movie);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(movie) {
      return new Show.PageLayout({
        model: movie
      });
    };

    Controller.prototype.getDetailsLayoutView = function(movie) {
      var headerLayout;
      headerLayout = new Show.HeaderLayout({
        model: movie
      });
      this.listenTo(headerLayout, "show", (function(_this) {
        return function() {
          var detail, teaser;
          teaser = new Show.MovieTeaser({
            model: movie
          });
          detail = new Show.Details({
            model: movie
          });
          headerLayout.regionSide.show(teaser);
          return headerLayout.regionMeta.show(detail);
        };
      })(this));
      return this.layout.regionHeader.show(headerLayout);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("MovieApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  Show.PageLayout = (function(_super) {
    __extends(PageLayout, _super);

    function PageLayout() {
      return PageLayout.__super__.constructor.apply(this, arguments);
    }

    PageLayout.prototype.className = 'movie-show detail-container';

    return PageLayout;

  })(App.Views.LayoutWithHeaderView);
  Show.HeaderLayout = (function(_super) {
    __extends(HeaderLayout, _super);

    function HeaderLayout() {
      return HeaderLayout.__super__.constructor.apply(this, arguments);
    }

    HeaderLayout.prototype.className = 'movie-details';

    return HeaderLayout;

  })(App.Views.LayoutDetailsHeaderView);
  Show.Details = (function(_super) {
    __extends(Details, _super);

    function Details() {
      return Details.__super__.constructor.apply(this, arguments);
    }

    Details.prototype.template = 'apps/movie/show/details_meta';

    return Details;

  })(App.Views.ItemView);
  return Show.MovieTeaser = (function(_super) {
    __extends(MovieTeaser, _super);

    function MovieTeaser() {
      return MovieTeaser.__super__.constructor.apply(this, arguments);
    }

    MovieTeaser.prototype.tagName = "div";

    MovieTeaser.prototype.className = "card-detail";

    MovieTeaser.prototype.triggers = {
      "click .menu": "movie-menu:clicked"
    };

    return MovieTeaser;

  })(App.Views.CardView);
});

this.Kodi.module("NavMain", function(NavMain, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    getNav: function() {
      var navStructure;
      navStructure = App.request('navMain:entities');
      return new NavMain.List({
        collection: navStructure
      });
    },
    getNavChildren: function(parentId, title) {
      var navStructure;
      if (title == null) {
        title = 'default';
      }
      navStructure = App.request('navMain:entities', parentId);
      if (title !== 'default') {
        navStructure.set({
          title: title
        });
      }
      return new NavMain.ItemList({
        model: navStructure
      });
    }
  };
  this.onStart = function(options) {
    return App.vent.on("shell:ready", (function(_this) {
      return function(options) {
        var nav;
        nav = API.getNav();
        return App.regionNav.show(nav);
      };
    })(this));
  };
  return App.reqres.setHandler("navMain:children:show", function(parentId, title) {
    if (title == null) {
      title = 'default';
    }
    return API.getNavChildren(parentId, title);
  });
});

this.Kodi.module("NavMain", function(NavMain, App, Backbone, Marionette, $, _) {
  NavMain.List = (function(_super) {
    __extends(List, _super);

    function List() {
      return List.__super__.constructor.apply(this, arguments);
    }

    List.prototype.template = "apps/navMain/show/navMain";

    return List;

  })(Backbone.Marionette.ItemView);
  NavMain.Item = (function(_super) {
    __extends(Item, _super);

    function Item() {
      return Item.__super__.constructor.apply(this, arguments);
    }

    Item.prototype.template = "apps/navMain/show/nav_item";

    Item.prototype.tagName = "li";

    Item.prototype.initialize = function() {
      var classes, tag;
      classes = [];
      if (this.model.get('path') === helpers.url.path()) {
        classes.push('active');
      }
      tag = this.themeLink(this.model.get('title'), this.model.get('path'), {
        'className': classes.join(' ')
      });
      return this.model.set({
        link: tag
      });
    };

    return Item;

  })(Backbone.Marionette.ItemView);
  return NavMain.ItemList = (function(_super) {
    __extends(ItemList, _super);

    function ItemList() {
      return ItemList.__super__.constructor.apply(this, arguments);
    }

    ItemList.prototype.template = 'apps/navMain/show/nav_sub';

    ItemList.prototype.childView = NavMain.Item;

    ItemList.prototype.tagName = "div";

    ItemList.prototype.childViewContainer = 'ul.items';

    ItemList.prototype.className = "nav-sub";

    ItemList.prototype.initialize = function() {
      return this.collection = this.model.get('items');
    };

    return ItemList;

  })(App.Views.CompositeView);
});

this.Kodi.module("NotificationsApp", function(NotificationApp, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    notificationMinTimeOut: 5000
  };
  return App.commands.setHandler("notification:show", function(msg, severity) {
    var timeout;
    if (severity == null) {
      severity = 'normal';
    }
    timeout = msg.length < 50 ? API.notificationMinTimeOut : msg.length * 100;
    return $.snackbar({
      content: msg,
      style: 'type-' + severity,
      timeout: timeout
    });
  });
});

this.Kodi.module("PlayerApp", function(PlayerApp, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    getKodiPlayer: function() {
      return new PlayerApp.Show.Player();
    },
    doKodiCommand: function(command, params, callback) {
      return App.request('command:kodi:player', command, params, (function(_this) {
        return function() {
          return _this.pollingUpdate(callback);
        };
      })(this));
    },
    getAppController: function() {
      return App.request("command:kodi:controller", 'auto', 'Application');
    },
    pollingUpdate: function(callback) {
      if (!App.request('sockets:active')) {
        return App.request('state:kodi:update', callback);
      }
    },
    initKodiPlayer: function(player) {
      var $playerCtx, $progress, $volume, appController;
      this.initProgress('kodi');
      this.initVolume('kodi');
      App.vent.trigger("state:player:updated", 'kodi');
      appController = this.getAppController();
      App.listenTo(player, "control:play", (function(_this) {
        return function() {
          return _this.doKodiCommand('PlayPause', 'toggle');
        };
      })(this));
      App.listenTo(player, "control:prev", (function(_this) {
        return function() {
          return _this.doKodiCommand('GoTo', 'previous');
        };
      })(this));
      App.listenTo(player, "control:next", (function(_this) {
        return function() {
          return _this.doKodiCommand('GoTo', 'next');
        };
      })(this));
      App.listenTo(player, "control:repeat", (function(_this) {
        return function() {
          return _this.doKodiCommand('SetRepeat', 'cycle');
        };
      })(this));
      App.listenTo(player, "control:shuffle", (function(_this) {
        return function() {
          console.log('suff');
          return _this.doKodiCommand('SetShuffle', 'toggle');
        };
      })(this));
      App.listenTo(player, "control:mute", (function(_this) {
        return function() {
          return appController.toggleMute(function() {
            return _this.pollingUpdate();
          });
        };
      })(this));
      $playerCtx = $('#player-kodi');
      $progress = $('.playing-progress', $playerCtx);
      $progress.on('change', function() {
        API.timerStop();
        return API.doKodiCommand('Seek', Math.round(this.vGet()), function() {
          return API.timerStart();
        });
      });
      $progress.on('slide', function() {
        return API.timerStop();
      });
      $volume = $('.volume', $playerCtx);
      return $volume.on('change', function() {
        appController.setVolume(Math.round(this.vGet()));
        return API.pollingUpdate();
      });
    },
    timerStart: function() {
      return App.playingTimerInterval = setTimeout(((function(_this) {
        return function() {
          return _this.timerUpdate();
        };
      })(this)), 1000);
    },
    timerStop: function() {
      return clearTimeout(App.playingTimerInterval);
    },
    timerUpdate: function() {
      var cur, curTimeObj, dur, percent, stateObj;
      stateObj = App.request("state:kodi");
      this.timerStop();
      if (stateObj.isPlaying() && (stateObj.getPlaying('time') != null)) {
        cur = helpers.global.timeToSec(stateObj.getPlaying('time')) + 1;
        dur = helpers.global.timeToSec(stateObj.getPlaying('totaltime'));
        percent = Math.ceil(cur / dur * 100);
        curTimeObj = helpers.global.secToTime(cur);
        stateObj.setPlaying('time', curTimeObj);
        this.setProgress('kodi', percent, curTimeObj);
        return this.timerStart();
      }
    },
    setProgress: function(player, percent, currentTime) {
      var $cur, $playerCtx;
      if (percent == null) {
        percent = 0;
      }
      $playerCtx = $('#player-' + player);
      $cur = $('.playing-time-current', $playerCtx);
      $cur.html(helpers.global.formatTime(currentTime));
      return $('.playing-progress', $playerCtx).val(percent);
    },
    initProgress: function(player, percent) {
      var $playerCtx;
      if (percent == null) {
        percent = 0;
      }
      $playerCtx = $('#player-' + player);
      return $('.playing-progress', $playerCtx).noUiSlider({
        start: percent,
        connect: 'upper',
        step: 1,
        range: {
          min: 0,
          max: 100
        }
      });
    },
    initVolume: function(player, percent) {
      var $playerCtx;
      if (percent == null) {
        percent = 50;
      }
      $playerCtx = $('#player-' + player);
      return $('.volume', $playerCtx).noUiSlider({
        start: percent,
        connect: 'upper',
        step: 1,
        range: {
          min: 0,
          max: 100
        }
      });
    }
  };
  return this.onStart = function(options) {
    App.vent.on("shell:ready", (function(_this) {
      return function(options) {
        App.kodiPlayer = API.getKodiPlayer();
        App.listenTo(App.kodiPlayer, "show", function() {
          API.initKodiPlayer(App.kodiPlayer);
          return App.execute("player:kodi:timer", 'start');
        });
        return App.regionPlayerKodi.show(App.kodiPlayer);
      };
    })(this));
    return App.commands.setHandler('player:kodi:timer', function(state) {
      if (state == null) {
        state = 'start';
      }
      if (state === 'start') {
        return API.timerStart();
      } else if (state === 'stop') {
        return API.timerStop();
      } else if (state === 'update') {
        return API.timerUpdate();
      }
    });
  };
});

this.Kodi.module("PlayerApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  return Show.Player = (function(_super) {
    __extends(Player, _super);

    function Player() {
      return Player.__super__.constructor.apply(this, arguments);
    }

    Player.prototype.template = "apps/player/show/player";

    Player.prototype.regions = {
      regionProgress: '.playing-progress',
      regionVolume: '.volume',
      regionThumbnail: '.playing-thumb',
      regionTitle: '.playing-title',
      regionSubtitle: '.playing-subtitle',
      regionTimeCur: '.playing-time-current',
      regionTimeDur: '.playing-time-duration'
    };

    Player.prototype.triggers = {
      'click .control-prev': 'control:prev',
      'click .control-play': 'control:play',
      'click .control-next': 'control:next',
      'click .control-stop': 'control:stop',
      'click .control-mute': 'control:mute',
      'click .control-shuffle': 'control:shuffle',
      'click .control-repeat': 'control:repeat',
      'click .control-menu': 'control:menu'
    };

    return Player;

  })(App.Views.ItemView);
});

this.Kodi.module("PlaylistApp.List", function(List, App, Backbone, Marionette, $, _) {
  return List.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function() {
      return App.vent.on("shell:ready", (function(_this) {
        return function(options) {
          return _this.getPlaylistBar();
        };
      })(this));
    };

    Controller.prototype.getPlaylistBar = function() {
      this.layout = this.getLayout();
      this.listenTo(this.layout, "show", (function(_this) {
        return function() {
          _this.renderList('kodi', 'audio');
          return App.vent.on("state:initialized", function() {
            var stateObj;
            stateObj = App.request("state:current");
            return _this.changePlaylist(stateObj.getState('player'), stateObj.getState('media'));
          });
        };
      })(this));
      this.listenTo(this.layout, 'playlist:kodi:audio', (function(_this) {
        return function() {
          return _this.changePlaylist('kodi', 'audio');
        };
      })(this));
      this.listenTo(this.layout, 'playlist:kodi:video', (function(_this) {
        return function() {
          return _this.changePlaylist('kodi', 'video');
        };
      })(this));
      return App.regionPlaylist.show(this.layout);
    };

    Controller.prototype.getLayout = function() {
      return new List.Layout();
    };

    Controller.prototype.getList = function(collection) {
      return new List.Items({
        collection: collection
      });
    };

    Controller.prototype.renderList = function(type, media) {
      var collection;
      collection = App.request("playlist:list", type, media);
      this.layout.$el.removeClassStartsWith('media-').addClass('media-' + media);
      return App.execute("when:entity:fetched", collection, (function(_this) {
        return function() {
          var listView;
          listView = _this.getList(collection);
          if (type === 'kodi') {
            _this.layout.kodiPlayList.show(listView);
          } else {
            _this.layout.localPlayList.show(listView);
          }
          _this.bindActions(listView, type, media);
          return App.vent.trigger("state:content:updated");
        };
      })(this));
    };

    Controller.prototype.bindActions = function(listView, type, media) {
      var playlist;
      playlist = App.request("command:" + type + ":controller", media, 'PlayList');
      this.listenTo(listView, "childview:playlist:item:remove", function(playlistView, item) {
        return playlist.remove(item.model.get('position'));
      });
      return this.listenTo(listView, "childview:playlist:item:play", function(playlistView, item) {
        return playlist.playEntity('position', parseInt(item.model.get('position')));
      });
    };

    Controller.prototype.changePlaylist = function(player, media) {
      return this.renderList(player, media);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("PlaylistApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.Layout = (function(_super) {
    __extends(Layout, _super);

    function Layout() {
      return Layout.__super__.constructor.apply(this, arguments);
    }

    Layout.prototype.template = "apps/playlist/list/playlist_bar";

    Layout.prototype.tagName = "div";

    Layout.prototype.className = "playlist-bar";

    Layout.prototype.regions = {
      kodiPlayList: '.kodi-playlist',
      localPlayList: '.local-playlist'
    };

    Layout.prototype.triggers = {
      'click .kodi-playlists .media-toggle .video': 'playlist:kodi:video',
      'click .kodi-playlists .media-toggle .audio': 'playlist:kodi:audio'
    };

    return Layout;

  })(App.Views.LayoutView);
  List.Item = (function(_super) {
    __extends(Item, _super);

    function Item() {
      return Item.__super__.constructor.apply(this, arguments);
    }

    Item.prototype.template = "apps/playlist/list/playlist_item";

    Item.prototype.tagName = "li";

    Item.prototype.initialize = function() {
      var subtitle;
      subtitle = '';
      switch (this.model.get('type')) {
        case 'song':
          subtitle = this.model.get('artist').join(', ');
          break;
        default:
          subtitle = '';
      }
      return this.model.set({
        subtitle: subtitle
      });
    };

    Item.prototype.triggers = {
      "click .remove": "playlist:item:remove",
      "click .play": "playlist:item:play"
    };

    Item.prototype.attributes = function() {
      return {
        "class": 'item pos-' + this.model.get('position')
      };
    };

    return Item;

  })(App.Views.ItemView);
  return List.Items = (function(_super) {
    __extends(Items, _super);

    function Items() {
      return Items.__super__.constructor.apply(this, arguments);
    }

    Items.prototype.childView = List.Item;

    Items.prototype.tagName = "ul";

    Items.prototype.className = "playlist-items";

    return Items;

  })(App.Views.CollectionView);
});

this.Kodi.module("PlaylistApp", function(PlaylistApp, App, Backbone, Marionette, $, _) {
  var API;
  PlaylistApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "playlist": "list"
    };

    return Router;

  })(App.Router.Base);
  API = {
    list: function() {},
    type: 'kodi',
    media: 'audio',
    setContext: function(type, media) {
      if (type == null) {
        type = 'kodi';
      }
      if (media == null) {
        media = 'audio';
      }
      this.type = type;
      return this.media = media;
    },
    getController: function() {
      return App.request("command:" + this.type + ":controller", this.media, 'PlayList');
    },
    getPlaylistItems: function() {
      return App.request("playlist:" + this.type + ":entities", this.media);
    }
  };
  App.reqres.setHandler("playlist:list", function(type, media) {
    API.setContext(type, media);
    return API.getPlaylistItems();
  });
  App.on("before:start", function() {
    return new PlaylistApp.Router({
      controller: API
    });
  });
  return App.addInitializer(function() {
    var controller;
    controller = new PlaylistApp.List.Controller();
    return App.commands.setHandler("playlist:refresh", function(type, media) {
      return controller.renderList(type, media);
    });
  });
});

this.Kodi.module("SettingsApp", function(SettingsApp, App, Backbone, Marionette, $, _) {
  var API;
  SettingsApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "settings/web": "local",
      "settings/kodi": "kodi"
    };

    return Router;

  })(App.Router.Base);
  API = {
    subNavId: 51,
    local: function() {
      return new SettingsApp.Show.Local.Controller();
    },
    kodi: function() {
      return new SettingsApp.Show.Kodi.Controller();
    },
    getSubNav: function() {
      return App.request("navMain:children:show", this.subNavId, 'Sections');
    }
  };
  App.on("before:start", function() {
    return new SettingsApp.Router({
      controller: API
    });
  });
  return App.reqres.setHandler('settings:subnav', function() {
    return API.getSubNav();
  });
});

this.Kodi.module("SettingsApp.Show.Kodi", function(Kodi, App, Backbone, Marionette, $, _) {
  return Kodi.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function() {
      this.layout = this.getLayoutView();
      this.listenTo(this.layout, "show", (function(_this) {
        return function() {
          _this.getSubNav();
          return _this.getForm();
        };
      })(this));
      return App.regionContent.show(this.layout);
    };

    Controller.prototype.getLayoutView = function() {
      return new App.SettingsApp.Show.Layout();
    };

    Controller.prototype.getSubNav = function() {
      var subNav;
      subNav = App.request('settings:subnav');
      return this.layout.regionSidebarFirst.show(subNav);
    };

    Controller.prototype.getForm = function() {
      var form, options;
      options = {
        form: this.getSructure(),
        formState: this.getState(),
        config: {
          attributes: {
            "class": 'settings-form'
          }
        }
      };
      form = App.request("form:wrapper", options);
      return this.layout.regionContent.show(form);
    };

    Controller.prototype.getSructure = function() {
      return [
        {
          title: 'List options',
          id: 'list',
          children: [
            {
              id: 'ignore-article',
              title: 'Ignore Article',
              type: 'checkbox',
              defaultValue: true,
              description: 'Ignore terms such as "The" and "a" when sorting lists'
            }
          ]
        }
      ];
    };

    Controller.prototype.getState = function() {
      return {
        'default-player': 'local',
        'jsonrpc-address': '/jsonrpc',
        'test-checkbox': false
      };
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("SettingsApp.Show.Local", function(Local, App, Backbone, Marionette, $, _) {
  return Local.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function() {
      this.layout = this.getLayoutView();
      this.listenTo(this.layout, "show", (function(_this) {
        return function() {
          _this.getSubNav();
          return _this.getForm();
        };
      })(this));
      return App.regionContent.show(this.layout);
    };

    Controller.prototype.getLayoutView = function() {
      return new App.SettingsApp.Show.Layout();
    };

    Controller.prototype.getSubNav = function() {
      var subNav;
      subNav = App.request('settings:subnav');
      return this.layout.regionSidebarFirst.show(subNav);
    };

    Controller.prototype.getForm = function() {
      var form, options;
      options = {
        form: this.getSructure(),
        formState: this.getState(),
        config: {
          attributes: {
            "class": 'settings-form'
          },
          callback: (function(_this) {
            return function(data, formView) {
              return _this.saveCallback(data, formView);
            };
          })(this)
        }
      };
      form = App.request("form:wrapper", options);
      return this.layout.regionContent.show(form);
    };

    Controller.prototype.getSructure = function() {
      return [
        {
          title: 'General Options',
          id: 'general',
          children: [
            {
              id: 'defaultPlayer',
              title: 'Default player',
              type: 'select',
              options: {
                auto: 'Auto',
                kodi: 'Kodi',
                local: 'Local'
              },
              defaultValue: 'auto',
              description: 'What player to start with'
            }
          ]
        }, {
          title: 'List options',
          id: 'list',
          children: [
            {
              id: 'ignoreArticle',
              title: 'Ignore article',
              type: 'checkbox',
              defaultValue: true,
              description: 'Ignore terms such as "The" and "a" when sorting lists'
            }, {
              id: 'albumAtristsOnly',
              title: 'Album artists only',
              type: 'checkbox',
              defaultValue: true,
              description: 'When listing artists should we only see arttists with albums or all artists found. Warning: turning this off can impact performance with large libraries'
            }
          ]
        }, {
          title: 'Advanced Options',
          id: 'advanced',
          children: [
            {
              id: 'jsonRpcEndpoint',
              title: 'JsonRPC path',
              type: 'textfield',
              defaultValue: 'jsonrpc',
              description: "Default is 'jsonrpc'"
            }, {
              id: 'socketsHost',
              title: 'Websockets Host',
              type: 'textfield',
              defaultValue: 'auto',
              description: "The hostname used for websockets connection. Set to 'auto' to use the current hostname."
            }, {
              id: 'pollInterval',
              title: 'Poll Interval',
              type: 'select',
              defaultValue: '10000',
              options: {
                '5000': '5 sec',
                '10000': '10 sec',
                '30000': '30 sec',
                '60000': '1 min'
              },
              description: "How often do I poll for updates from Kodi (Only applies when websockets inactive)"
            }
          ]
        }
      ];
    };

    Controller.prototype.getState = function() {
      return config.get('app', 'config:local', config["static"]);
    };

    Controller.prototype.saveCallback = function(data, formView) {
      config.set('app', 'config:local', data);
      return Kodi.execute("notification:show", "Web Settings saved.");
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("SettingsApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  return Show.Layout = (function(_super) {
    __extends(Layout, _super);

    function Layout() {
      return Layout.__super__.constructor.apply(this, arguments);
    }

    Layout.prototype.className = "settings-page";

    return Layout;

  })(App.Views.LayoutWithSidebarFirstView);
});

this.Kodi.module("Shell", function(Shell, App, Backbone, Marionette, $, _) {
  var API;
  Shell.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "": "homePage",
      "home": "homePage"
    };

    return Router;

  })(App.Router.Base);
  API = {
    homePage: function() {
      var home;
      home = new Shell.HomepageLayout();
      App.regionContent.show(home);
      App.execute("images:fanart:set");
      App.vent.on("state:changed", function(state) {
        var playingItem, stateObj;
        stateObj = App.request("state:current");
        if (stateObj.isPlayingItemChanged()) {
          playingItem = stateObj.getPlaying('item');
          return App.execute("images:fanart:set", playingItem.fanart);
        }
      });
      return App.listenTo(home, "destroy", (function(_this) {
        return function() {
          return App.execute("images:fanart:set", 'none');
        };
      })(this));
    },
    renderLayout: function() {
      var playlistState, shellLayout;
      shellLayout = new Shell.Layout();
      App.root.show(shellLayout);
      App.addRegions(shellLayout.regions);
      App.execute("loading:show:page");
      playlistState = config.get('app', 'shell:playlist:state', 'open');
      if (playlistState === 'closed') {
        this.alterRegionClasses('add', "shell-playlist-closed");
      }
      return App.listenTo(shellLayout, "shell:playlist:toggle", (function(_this) {
        return function(child, args) {
          var state;
          playlistState = config.get('app', 'shell:playlist:state', 'open');
          state = playlistState === 'open' ? 'closed' : 'open';
          config.set('app', 'shell:playlist:state', state);
          return _this.alterRegionClasses('toggle', "shell-playlist-closed");
        };
      })(this));
    },
    alterRegionClasses: function(op, classes, region) {
      var $body, action;
      if (region == null) {
        region = 'root';
      }
      $body = App.getRegion(region).$el;
      action = "" + op + "Class";
      return $body[action](classes);
    }
  };
  return App.addInitializer(function() {
    return App.commands.setHandler("shell:view:ready", function() {
      API.renderLayout();
      new Shell.Router({
        controller: API
      });
      App.vent.trigger("shell:ready");
      return App.commands.setHandler("body:state", function(op, state) {
        return API.alterRegionClasses(op, state);
      });
    });
  });
});

this.Kodi.module("Shell", function(Shell, App, Backbone, Marionette, $, _) {
  Shell.Layout = (function(_super) {
    __extends(Layout, _super);

    function Layout() {
      return Layout.__super__.constructor.apply(this, arguments);
    }

    Layout.prototype.template = "apps/shell/show/shell";

    Layout.prototype.regions = {
      regionNav: '#nav-bar',
      regionContent: '#content',
      regionSidebarFirst: '#sidebar-first',
      regionPlaylist: '#playlist-bar',
      regionTitle: '#page-title .title',
      regionTitleContext: '#page-title .context',
      regionFanart: '#fanart',
      regionPlayerKodi: '#player-kodi',
      regionPlayerLocal: '#player-local',
      regionModal: '#modal-window',
      regionModalTitle: '.modal-title',
      regionModalBody: '.modal-body',
      regionModalFooter: '.modal-footer'
    };

    Layout.prototype.triggers = {
      "click .playlist-toggle-open": "shell:playlist:toggle"
    };

    return Layout;

  })(Backbone.Marionette.LayoutView);
  Shell.HomepageLayout = (function(_super) {
    __extends(HomepageLayout, _super);

    function HomepageLayout() {
      return HomepageLayout.__super__.constructor.apply(this, arguments);
    }

    HomepageLayout.prototype.template = "apps/shell/show/homepage";

    return HomepageLayout;

  })(Backbone.Marionette.LayoutView);
  return App.execute("shell:view:ready");
});

this.Kodi.module("SongApp.List", function(List, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    getSongsView: function(songs) {
      this.songsView = new List.Songs({
        collection: songs
      });
      App.listenTo(this.songsView, 'childview:song:play', (function(_this) {
        return function(list, item) {
          return _this.playSong(item.model.get('songid'));
        };
      })(this));
      App.listenTo(this.songsView, 'childview:song:add', (function(_this) {
        return function(list, item) {
          return _this.addSong(item.model.get('songid'));
        };
      })(this));
      App.listenTo(this.songsView, "show", function() {
        return App.vent.trigger("state:content:updated");
      });
      return this.songsView;
    },
    playSong: function(songId) {
      var playlist;
      playlist = App.request("command:kodi:controller", 'audio', 'PlayList');
      return playlist.play('songid', songId);
    },
    addSong: function(songId) {
      var playlist;
      playlist = App.request("command:kodi:controller", 'audio', 'PlayList');
      return playlist.add('songid', songId);
    }
  };
  return App.reqres.setHandler("song:list:view", function(songs) {
    return API.getSongsView(songs);
  });
});

this.Kodi.module("SongApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.Song = (function(_super) {
    __extends(Song, _super);

    function Song() {
      return Song.__super__.constructor.apply(this, arguments);
    }

    Song.prototype.template = 'apps/song/list/song';

    Song.prototype.tagName = "tr";

    Song.prototype.initialize = function() {
      var duration;
      duration = helpers.global.secToTime(this.model.get('duration'));
      return this.model.set({
        duration: helpers.global.formatTime(duration)
      });
    };

    Song.prototype.triggers = {
      "click .play": "song:play",
      "dblclick .song-title": "song:play",
      "click .add": "song:add"
    };

    Song.prototype.attributes = function() {
      return {
        "class": 'song table-row can-play item-song-' + this.model.get('songid')
      };
    };

    return Song;

  })(App.Views.ItemView);
  return List.Songs = (function(_super) {
    __extends(Songs, _super);

    function Songs() {
      return Songs.__super__.constructor.apply(this, arguments);
    }

    Songs.prototype.childView = List.Song;

    Songs.prototype.tagName = "table";

    Songs.prototype.className = "songs-table table table-striped table-hover";

    return Songs;

  })(App.Views.CollectionView);
});

this.Kodi.module("StateApp", function(StateApp, App, Backbone, Marionette, $, _) {
  return StateApp.Base = (function(_super) {
    __extends(Base, _super);

    function Base() {
      return Base.__super__.constructor.apply(this, arguments);
    }

    Base.prototype.state = {
      player: 'kodi',
      media: 'audio',
      volume: 50,
      muted: false,
      shuffled: false,
      repeat: 'off'
    };

    Base.prototype.playing = {
      playing: false,
      paused: false,
      playState: '',
      item: {},
      position: {},
      media: 'audio',
      itemChanged: false,
      latPlaying: '',
      canrepeat: true,
      canseek: true,
      canshuffle: true,
      partymode: false,
      percentage: 0,
      playlistid: 0,
      position: 0,
      speed: 0,
      time: {
        hours: 0,
        milliseconds: 0,
        minutes: 0,
        seconds: 0
      },
      time: {
        hours: 0,
        milliseconds: 0,
        minutes: 0,
        seconds: 0
      }
    };

    Base.prototype.defaultPlayingItem = {
      thumbnail: '',
      fanart: '',
      id: 0,
      songid: 0,
      episodeid: 0,
      album: '',
      albumid: '',
      duration: 0,
      type: 'song'
    };

    Base.prototype.getState = function(key) {
      if (key == null) {
        key = 'all';
      }
      if (key === 'all') {
        return this.state;
      } else {
        return this.state[key];
      }
    };

    Base.prototype.setState = function(key, value) {
      return this.state[key] = value;
    };

    Base.prototype.getPlaying = function(key) {
      var ret;
      if (key == null) {
        key = 'all';
      }
      ret = this.playing;
      if (ret.item.length === 0) {
        ret.item = this.defaultPlayingItem;
      }
      if (key === 'all') {
        return this.playing;
      } else {
        return this.playing[key];
      }
    };

    Base.prototype.setPlaying = function(key, value) {
      return this.playing[key] = value;
    };

    Base.prototype.isPlaying = function() {
      return this.getPlaying('playing');
    };

    Base.prototype.isPlayingItemChanged = function() {
      return this.getPlaying('itemChanged');
    };

    Base.prototype.doCallback = function(callback, resp) {
      if (typeof callback === 'function') {
        return callback(resp);
      }
    };

    Base.prototype.getCurrentState = function(callback) {};

    Base.prototype.getCachedState = function() {
      return {
        state: this.state,
        playing: this.playing
      };
    };

    Base.prototype.setPlayer = function(player) {
      var $body;
      if (player == null) {
        player = 'kodi';
      }
      $body = App.getRegion('root').$el;
      $body.removeClassStartsWith('active-player-').addClass('active-player-' + player);
      return config.set('state', 'lastplayer', player);
    };

    Base.prototype.getPlayer = function() {
      var $body, player;
      player = 'kodi';
      $body = App.getRegion('root').$el;
      if ($body.hasClass('active-player-lcal')) {
        player = 'local';
      }
      return player;
    };

    return Base;

  })(Marionette.Object);
});

this.Kodi.module("StateApp.Kodi", function(StateApp, App, Backbone, Marionette, $, _) {
  return StateApp.State = (function(_super) {
    __extends(State, _super);

    function State() {
      return State.__super__.constructor.apply(this, arguments);
    }

    State.prototype.playerController = {};

    State.prototype.applicationController = {};

    State.prototype.playlistApi = {};

    State.prototype.initialize = function() {
      this.setState('player', 'kodi');
      this.playerController = App.request("command:kodi:controller", 'auto', 'Player');
      this.applicationController = App.request("command:kodi:controller", 'auto', 'Application');
      this.playlistApi = App.request("playlist:kodi:entity:api");
      App.reqres.setHandler("state:kodi:update", (function(_this) {
        return function(callback) {
          return _this.getCurrentState(callback);
        };
      })(this));
      return App.reqres.setHandler("state:kodi:get", (function(_this) {
        return function() {
          return _this.getCachedState();
        };
      })(this));
    };

    State.prototype.getCurrentState = function(callback) {
      return this.applicationController.getProperties((function(_this) {
        return function(properties) {
          _this.setState('volume', properties.volume);
          _this.setState('muted', properties.muted);
          App.reqres.setHandler('player:kodi:timer', 'stop');
          return _this.playerController.getPlaying(function(playing) {
            var autoMap, key, media, _i, _len;
            if (playing) {
              _this.setPlaying('playing', true);
              _this.setPlaying('paused', playing.properties.speed === 0);
              _this.setPlaying('playState', (playing.properties.speed === 0 ? 'paused' : 'playing'));
              autoMap = ['canrepeat', 'canseek', 'canshuffle', 'partymode', 'percentage', 'playlistid', 'position', 'speed', 'time', 'totaltime'];
              for (_i = 0, _len = autoMap.length; _i < _len; _i++) {
                key = autoMap[_i];
                if (playing.properties[key]) {
                  _this.setPlaying(key, playing.properties[key]);
                }
              }
              _this.setState('shuffled', playing.properties.shuffled);
              _this.setState('repeat', playing.properties.repeat);
              media = _this.playerController.playerIdToName(playing.properties.playlistid);
              if (media) {
                _this.setState('media', media);
              }
              if (playing.item.file !== _this.getPlaying('lastPlaying')) {
                _this.setPlaying('itemChanged', true);
                App.vent.trigger("state:kodi:itemchanged", _this.getCachedState());
              } else {
                _this.setPlaying('itemChanged', false);
              }
              _this.setPlaying('lastPlaying', playing.item.file);
              _this.setPlaying('item', _this.parseItem(playing.item, {
                media: media,
                playlistid: playing.properties.playlistid
              }));
              App.reqres.setHandler('player:kodi:timer', 'start');
            } else {
              _this.setPlaying('playing', false);
              _this.setPlaying('paused', false);
              _this.setPlaying('item', _this.defaultPlayingItem);
              _this.setPlaying('lstPlaying', '');
            }
            App.vent.trigger("state:kodi:changed", _this.getCachedState());
            App.vent.trigger("state:changed");
            return _this.doCallback(callback, _this.getCachedState());
          });
        };
      })(this));
    };

    State.prototype.parseItem = function(model, options) {
      model = this.playlistApi.parseItem(model, options);
      model = App.request("images:path:entity", model);
      model.url = helpers.url.get(model.type, model.id);
      model.url = helpers.url.playlistUrl(model);
      return model;
    };

    return State;

  })(App.StateApp.Base);
});

this.Kodi.module("StateApp.Kodi", function(StateApp, App, Backbone, Marionette, $, _) {
  return StateApp.Notifications = (function(_super) {
    __extends(Notifications, _super);

    function Notifications() {
      return Notifications.__super__.constructor.apply(this, arguments);
    }

    Notifications.prototype.socketPort = config.get('static', 'socketsPort');

    Notifications.prototype.socketPath = config.get('static', 'jsonRpcEndpoint');

    Notifications.prototype.wsActive = false;

    Notifications.prototype.wsObj = {};

    Notifications.prototype.getConnection = function() {
      var host, socketHost;
      host = config.get('static', 'socketsHost');
      socketHost = host === 'auto' ? location.hostname : host;
      return "ws://" + socketHost + ":" + this.socketPort + "/" + this.socketPath + "?kodi";
    };

    Notifications.prototype.initialize = function() {
      var msg, ws;
      if (window.WebSocket) {
        ws = new WebSocket(this.getConnection());
        ws.onopen = (function(_this) {
          return function(e) {
            helpers.debug.msg("Websockets Active");
            _this.wsActive = true;
            return App.vent.trigger("sockets:available");
          };
        })(this);
        ws.onerror = (function(_this) {
          return function(resp) {
            helpers.debug.msg(_this.socketConnectionErrorMsg(), "warning", resp);
            _this.wsActive = false;
            return App.vent.trigger("sockets:unavailable");
          };
        })(this);
        ws.onmessage = (function(_this) {
          return function(resp) {
            return _this.messageRecieved(resp);
          };
        })(this);
        ws.onclose = (function(_this) {
          return function(resp) {
            helpers.debug.msg("Websockets Closed", "warning", resp);
            return _this.wsActive = false;
          };
        })(this);
      } else {
        msg = "Your browser doesn't support websockets! Get with the times and update your browser.";
        helpers.debug.msg(t.gettext(msg), "warning", resp);
        App.vent.trigger("sockets:unavailable");
      }
      return App.reqres.setHandler("sockets:active", function() {
        return this.wsActive;
      });
    };

    Notifications.prototype.parseResponse = function(resp) {
      return jQuery.parseJSON(resp.data);
    };

    Notifications.prototype.messageRecieved = function(resp) {
      var data;
      data = this.parseResponse(resp);
      this.onMessage(data);
      return console.log(data);
    };

    Notifications.prototype.socketConnectionErrorMsg = function() {
      var msg;
      msg = "Failed to connect to websockets, so I am falling back to polling for updates. Which makes things slower and " + "uses more resources. Please ensure you have 'Allow programs on other systems to control Kodi' ENABLED " + "in the Kodi settings (System > Services > Remote control).  You may also get this if you are using proxies or " + "accessing via an IP addess when localhost will suffice. If websockets normally works, you might just need to " + "refresh your browser.";
      return t.gettext(msg);
    };

    Notifications.prototype.refreshStateNow = function(callback) {
      App.vent.trigger("state:kodi:changed", this.getCachedState());
      return setTimeout(((function(_this) {
        return function() {
          return App.request("state:kodi:update", function(state) {
            if (callback) {
              return callback(state);
            }
          });
        };
      })(this)), 1000);
    };

    Notifications.prototype.onMessage = function(data) {
      var playerController, wait;
      switch (data.method) {
        case 'Player.OnPlay':
          this.setPlaying('paused', false);
          this.setPlaying('playState', 'playing');
          App.execute("player:kodi:timer", 'start');
          this.refreshStateNow();
          break;
        case 'Player.OnStop':
          this.setPlaying('playing', false);
          App.execute("player:kodi:timer", 'stop');
          this.refreshStateNow();
          break;
        case 'Player.OnPropertyChanged':
          this.refreshStateNow();
          break;
        case 'Player.OnPause':
          this.setPlaying('paused', true);
          this.setPlaying('playState', 'paused');
          App.execute("player:kodi:timer", 'stop');
          this.refreshStateNow();
          break;
        case 'Player.OnSeek':
          App.execute("player:kodi:timer", 'stop');
          this.refreshStateNow(function() {
            return App.execute("player:kodi:timer", 'start');
          });
          break;
        case 'Playlist.OnClear':
        case 'Playlist.OnAdd':
        case 'Playlist.OnRemove':
          playerController = App.request("command:kodi:controller", 'auto', 'Player');
          App.execute("playlist:refresh", 'kodi', playerController.playerIdToName(data.params.data.playlistid));
          this.refreshStateNow();
          break;
        case 'Application.OnVolumeChanged':
          this.setState('volume', data.params.data.volume);
          this.setState('muted', data.params.data.muted);
          this.refreshStateNow();
          break;
        case 'VideoLibrary.OnScanStarted':
          App.execute("notification:show", t.gettext("Video library scan started"));
          break;
        case 'VideoLibrary.OnScanFinished':
          App.execute("notification:show", t.gettext("Video library scan complete"));
          break;
        case 'AudioLibrary.OnScanStarted':
          App.execute("notification:show", t.gettext("Audio library scan started"));
          break;
        case 'AudioLibrary.OnScanFinished':
          App.execute("notification:show", t.gettext("Audio library scan complete"));
          break;
        case 'Input.OnInputRequested':
          App.execute("input:textbox", '');
          wait = 60;
          App.inputTimeout = setTimeout((function() {
            var msg;
            msg = wait + t.gettext(' seconds ago, an input dialog opened on xbmc and it is still open! To prevent ' + 'a mainframe implosion, you should probably give me some text. I don\'t really care what it is at this point, ' + 'why not be creative? Do you have a ') + '<a href="http://goo.gl/PGE7wg" target="_blank">' + t.gettext('word of the day') + '</a>? ' + t.gettext('I won\'t tell...');
            App.execute("input:textbox", msg);
          }), 1000 * wait);
          break;
        case 'Input.OnInputFinished':
          clearTimeout(App.inputTimeout);
          App.execute("inpute:textbox:close");
          break;
        case 'System.OnQuit':
          App.execute("notification:show", t.gettext("Kodi has quit"));
          break;
      }
    };

    return Notifications;

  })(App.StateApp.Base);
});

this.Kodi.module("StateApp.Kodi", function(StateApp, App, Backbone, Marionette, $, _) {
  return StateApp.Polling = (function(_super) {
    __extends(Polling, _super);

    function Polling() {
      return Polling.__super__.constructor.apply(this, arguments);
    }

    Polling.prototype.commander = {};

    Polling.prototype.checkInterval = 10000;

    Polling.prototype.currentInterval = '';

    Polling.prototype.timeoutObj = {};

    Polling.prototype.failures = 0;

    Polling.prototype.maxFailures = 100;

    Polling.prototype.initialize = function() {
      var interval;
      interval = config.get('static', 'pollInterval');
      this.checkInterval = parseInt(interval);
      return this.currentInterval = this.checkInterval;
    };

    Polling.prototype.startPolling = function() {
      return this.update();
    };

    Polling.prototype.updateState = function() {
      var stateObj;
      stateObj = App.request("state:kodi");
      return stateObj.getCurrentState();
    };

    Polling.prototype.update = function() {
      if (App.kodiPolling.failures < App.kodiPolling.maxFailures) {
        App.kodiPolling.updateState();
        return App.kodiPolling.timeout = setTimeout(App.kodiPolling.ping, App.kodiPolling.currentInterval);
      } else {
        return App.execute("notification:show", t.gettext("Unable to communicate with Kodi in a long time. I think it's dead Jim!"));
      }
    };

    Polling.prototype.ping = function() {
      var commander;
      commander = App.request("command:kodi:controller", 'auto', 'Commander');
      commander.setOptions({
        timeout: 5000,
        error: function() {
          return App.kodiPolling.failure();
        }
      });
      commander.onError = function() {};
      return commander.sendCommand('Ping', [], function() {
        return App.kodiPolling.alive();
      });
    };

    Polling.prototype.alive = function() {
      App.kodiPolling.failures = 0;
      App.kodiPolling.currentInterval = App.kodiPolling.checkInterval;
      return App.kodiPolling.update();
    };

    Polling.prototype.failure = function() {
      App.kodiPolling.failures++;
      if (App.kodiPolling.failures > 10) {
        App.kodiPolling.currentInterval = App.kodiPolling.checkInterval * 5;
      }
      if (App.kodiPolling.failures > 20) {
        App.kodiPolling.currentInterval = App.kodiPolling.checkInterval * 10;
      }
      if (App.kodiPolling.failures > 30) {
        App.kodiPolling.currentInterval = App.kodiPolling.checkInterval * 30;
      }
      return App.kodiPolling.update();
    };

    return Polling;

  })(App.StateApp.Base);
});

this.Kodi.module("StateApp.Local", function(StateApp, App, Backbone, Marionette, $, _) {
  return StateApp.State = (function(_super) {
    __extends(State, _super);

    function State() {
      return State.__super__.constructor.apply(this, arguments);
    }

    return State;

  })(App.StateApp.Base);
});

this.Kodi.module("StateApp", function(StateApp, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    setState: function(player) {
      if (player == null) {
        player = 'kodi';
      }
      this.setBodyClasses(player);
      this.setPlayingContent(player);
      this.setPlayerPlaying(player);
      return this.setAppProperties(player);
    },
    playerClass: function(className, player) {
      return player + '-' + className;
    },
    setBodyClasses: function(player) {
      var $body, c, newClasses, stateObj, _i, _len, _results;
      stateObj = App.request("state:" + player);
      $body = App.getRegion('root').$el;
      $body.removeClassStartsWith(player + '-');
      newClasses = [];
      newClasses.push('shuffled-' + (stateObj.getState('shuffled') ? 'on' : 'off'));
      newClasses.push('partymode-' + (stateObj.getPlaying('partymode') ? 'on' : 'off'));
      newClasses.push('mute-' + (stateObj.getState('muted') ? 'on' : 'off'));
      newClasses.push('repeat-' + stateObj.getState('repeat'));
      newClasses.push('media-' + stateObj.getState('media'));
      if (stateObj.isPlaying()) {
        newClasses.push(stateObj.getPlaying('playState'));
      } else {
        newClasses.push('not-playing');
      }
      _results = [];
      for (_i = 0, _len = newClasses.length; _i < _len; _i++) {
        c = newClasses[_i];
        _results.push($body.addClass(this.playerClass(c, player)));
      }
      return _results;
    },
    setPlayingContent: function(player) {
      var $playlistCtx, className, item, playState, stateObj;
      stateObj = App.request("state:" + player);
      $playlistCtx = $('.media-' + stateObj.getState('media') + ' .' + player + '-playlist');
      $('.can-play').removeClassStartsWith(player + '-row-');
      $('.item', $playlistCtx).removeClassStartsWith('row-');
      if (stateObj.isPlaying()) {
        item = stateObj.getPlaying('item');
        if (item.type !== 'file') {
          playState = stateObj.getPlaying('playState');
          className = '.item-' + item.type + '-' + item.id;
          $(className).addClass(this.playerClass('row-' + playState, player));
          return $('.pos-' + stateObj.getPlaying('position'), $playlistCtx).addClass('row-' + playState);
        }
      }
    },
    setPlayerPlaying: function(player) {
      var $dur, $img, $playerCtx, $subtitle, $title, item, stateObj;
      stateObj = App.request("state:" + player);
      $playerCtx = $('#player-' + player);
      $title = $('.playing-title', $playerCtx);
      $subtitle = $('.playing-subtitle', $playerCtx);
      $dur = $('.playing-time-duration', $playerCtx);
      $img = $('.playing-thumb img', $playerCtx);
      if (stateObj.isPlaying()) {
        item = stateObj.getPlaying('item');
        $title.html(helpers.entities.playingLink(item));
        $subtitle.html(helpers.entities.getSubtitle(item));
        $dur.html(helpers.global.formatTime(stateObj.getPlaying('totaltime')));
        return $img.attr("src", item.thumbnail);
      } else {
        $title.html(t.gettext('Nothing Playing'));
        $subtitle.html('');
        $dur.html('0');
        return $img.attr('src', App.request("images:path:get"));
      }
    },
    setAppProperties: function(player) {
      var $playerCtx, stateObj;
      stateObj = App.request("state:" + player);
      $playerCtx = $('#player-' + player);
      return $('.volume', $playerCtx).val(stateObj.getState('volume'));
    },
    initKodiState: function() {
      App.kodiState = new StateApp.Kodi.State();
      App.localState = new StateApp.Local.State();
      App.kodiState.setPlayer(config.get('state', 'lastplayer', 'kodi'));
      App.kodiState.getCurrentState(function(state) {
        API.setState(App.kodiState.getState('player'));
        App.kodiSockets = new StateApp.Kodi.Notifications();
        App.kodiPolling = new StateApp.Kodi.Polling();
        App.vent.on("sockets:unavailable", function() {
          return App.kodiPolling.startPolling();
        });
        App.vent.on("playlist:rendered", function() {
          return App.request("playlist:refresh", App.kodiState.getState('player'), App.kodiState.getState('media'));
        });
        App.vent.on("state:content:updated", function() {
          return API.setPlayingContent('kodi');
        });
        App.vent.on("state:kodi:changed", function(state) {
          return API.setState('kodi');
        });
        App.vent.on("state:player:updated", function(player) {
          return API.setPlayerPlaying(player);
        });
        return App.vent.trigger("state:initialized");
      });
      App.reqres.setHandler("state:kodi", function() {
        return App.kodiState;
      });
      App.reqres.setHandler("state:local", function() {
        return App.localState;
      });
      App.reqres.setHandler("state:current", function() {
        var stateObj;
        stateObj = App.kodiState.getPlayer() === 'kodi' ? App.kodiState : App.localState;
        return stateObj;
      });
      return App.vent.trigger("state:changed");
    }
  };
  return App.addInitializer(function() {
    return API.initKodiState();
  });
});

this.Kodi.module("TVShowApp.List", function(List, App, Backbone, Marionette, $, _) {
  return List.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function() {
      var collection;
      collection = App.request("tvshow:entities");
      collection.availableFilters = this.getAvailableFilters();
      collection.sectionId = 21;
      return App.execute("when:entity:fetched", collection, (function(_this) {
        return function() {
          _this.layout = _this.getLayoutView(collection);
          _this.listenTo(_this.layout, "show", function() {
            _this.getFiltersView(collection);
            return _this.renderList(collection);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(tvshows) {
      return new List.ListLayout({
        collection: tvshows
      });
    };

    Controller.prototype.getTVShowsView = function(tvshows) {
      var view;
      view = new List.TVShows({
        collection: tvshows
      });
      this.listenTo(view, 'childview:tvshow:play', function(list, item) {
        var playlist;
        playlist = App.request("command:kodi:controller", 'video', 'PlayList');
        return playlist.play('tvshowid', item.model.get('tvshowid'));
      });
      return view;
    };

    Controller.prototype.getAvailableFilters = function() {
      return {
        sort: ['title', 'year', 'dateadded', 'rating'],
        filter: ['year', 'genre', 'unwatchedShows']
      };
    };

    Controller.prototype.getFiltersView = function(collection) {
      var filters;
      filters = App.request('filter:show', collection);
      this.layout.regionSidebarFirst.show(filters);
      return this.listenTo(filters, "filter:changed", (function(_this) {
        return function() {
          return _this.renderList(collection);
        };
      })(this));
    };

    Controller.prototype.renderList = function(collection) {
      var filteredCollection, view;
      App.execute("loading:show:view", this.layout.regionContent);
      filteredCollection = App.request('filter:apply:entites', collection);
      view = this.getTVShowsView(filteredCollection);
      return this.layout.regionContent.show(view);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("TVShowApp.List", function(List, App, Backbone, Marionette, $, _) {
  List.ListLayout = (function(_super) {
    __extends(ListLayout, _super);

    function ListLayout() {
      return ListLayout.__super__.constructor.apply(this, arguments);
    }

    ListLayout.prototype.className = "tvshow-list";

    return ListLayout;

  })(App.Views.LayoutWithSidebarFirstView);
  List.TVShowTeaser = (function(_super) {
    __extends(TVShowTeaser, _super);

    function TVShowTeaser() {
      return TVShowTeaser.__super__.constructor.apply(this, arguments);
    }

    TVShowTeaser.prototype.triggers = {
      "click .play": "tvshow:play",
      "click .menu": "tvshow-menu:clicked"
    };

    TVShowTeaser.prototype.initialize = function() {
      var subtitle;
      subtitle = '';
      subtitle += ' ' + this.model.get('rating');
      return this.model.set({
        subtitle: subtitle
      });
    };

    return TVShowTeaser;

  })(App.Views.CardView);
  List.Empty = (function(_super) {
    __extends(Empty, _super);

    function Empty() {
      return Empty.__super__.constructor.apply(this, arguments);
    }

    Empty.prototype.tagName = "li";

    Empty.prototype.className = "tvshow-empty-result";

    return Empty;

  })(App.Views.EmptyView);
  return List.TVShows = (function(_super) {
    __extends(TVShows, _super);

    function TVShows() {
      return TVShows.__super__.constructor.apply(this, arguments);
    }

    TVShows.prototype.childView = List.TVShowTeaser;

    TVShows.prototype.emptyView = List.Empty;

    TVShows.prototype.tagName = "ul";

    TVShows.prototype.className = "card-grid--tall";

    return TVShows;

  })(App.Views.CollectionView);
});

this.Kodi.module("TVShowApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  return Show.Controller = (function(_super) {
    __extends(Controller, _super);

    function Controller() {
      return Controller.__super__.constructor.apply(this, arguments);
    }

    Controller.prototype.initialize = function(options) {
      var id, tvshow;
      id = parseInt(options.id);
      tvshow = App.request("tvshow:entity", id);
      return App.execute("when:entity:fetched", tvshow, (function(_this) {
        return function() {
          App.execute("images:fanart:set", tvshow.get('fanart'));
          _this.layout = _this.getLayoutView(tvshow);
          _this.listenTo(_this.layout, "destroy", function() {
            return App.execute("images:fanart:set", 'none');
          });
          _this.listenTo(_this.layout, "show", function() {
            return _this.getDetailsLayoutView(tvshow);
          });
          return App.regionContent.show(_this.layout);
        };
      })(this));
    };

    Controller.prototype.getLayoutView = function(tvshow) {
      return new Show.PageLayout({
        model: tvshow
      });
    };

    Controller.prototype.getDetailsLayoutView = function(tvshow) {
      var headerLayout;
      headerLayout = new Show.HeaderLayout({
        model: tvshow
      });
      this.listenTo(headerLayout, "show", (function(_this) {
        return function() {
          var detail, teaser;
          teaser = new Show.TVShowTeaser({
            model: tvshow
          });
          detail = new Show.Details({
            model: tvshow
          });
          headerLayout.regionSide.show(teaser);
          return headerLayout.regionMeta.show(detail);
        };
      })(this));
      return this.layout.regionHeader.show(headerLayout);
    };

    return Controller;

  })(App.Controllers.Base);
});

this.Kodi.module("TVShowApp.Show", function(Show, App, Backbone, Marionette, $, _) {
  Show.PageLayout = (function(_super) {
    __extends(PageLayout, _super);

    function PageLayout() {
      return PageLayout.__super__.constructor.apply(this, arguments);
    }

    PageLayout.prototype.className = 'tvshow-show detail-container';

    return PageLayout;

  })(App.Views.LayoutWithHeaderView);
  Show.HeaderLayout = (function(_super) {
    __extends(HeaderLayout, _super);

    function HeaderLayout() {
      return HeaderLayout.__super__.constructor.apply(this, arguments);
    }

    HeaderLayout.prototype.className = 'tvshow-details';

    return HeaderLayout;

  })(App.Views.LayoutDetailsHeaderView);
  Show.Details = (function(_super) {
    __extends(Details, _super);

    function Details() {
      return Details.__super__.constructor.apply(this, arguments);
    }

    Details.prototype.template = 'apps/tvshow/show/details_meta';

    return Details;

  })(App.Views.ItemView);
  return Show.TVShowTeaser = (function(_super) {
    __extends(TVShowTeaser, _super);

    function TVShowTeaser() {
      return TVShowTeaser.__super__.constructor.apply(this, arguments);
    }

    TVShowTeaser.prototype.tagName = "div";

    TVShowTeaser.prototype.className = "card-detail";

    TVShowTeaser.prototype.triggers = {
      "click .menu": "tvshow-menu:clicked"
    };

    return TVShowTeaser;

  })(App.Views.CardView);
});

this.Kodi.module("TVShowApp", function(TVShowApp, App, Backbone, Marionette, $, _) {
  var API;
  TVShowApp.Router = (function(_super) {
    __extends(Router, _super);

    function Router() {
      return Router.__super__.constructor.apply(this, arguments);
    }

    Router.prototype.appRoutes = {
      "tvshows": "list",
      "tvshow/:id": "view"
    };

    return Router;

  })(App.Router.Base);
  API = {
    list: function() {
      return new TVShowApp.List.Controller;
    },
    view: function(id) {
      return new TVShowApp.Show.Controller({
        id: id
      });
    }
  };
  return App.on("before:start", function() {
    return new TVShowApp.Router({
      controller: API
    });
  });
});

this.Kodi.module("UiApp", function(UiApp, App, Backbone, Marionette, $, _) {
  var API;
  API = {
    openModal: function(title, msg, callback) {
      var $body, $modal, $title;
      this.closeModal();
      $title = App.getRegion('regionModalTitle').$el;
      $body = App.getRegion('regionModalBody').$el;
      $modal = App.getRegion('regionModal').$el;
      $title.html(title);
      $body.html(msg);
      $modal.modal();
      return $modal;
    },
    closeModal: function() {
      return App.getRegion('regionModal').$el.modal('hide');
    },
    closeModalButton: function() {
      return API.getButton('Close', 'default').on('click', function() {
        return API.closeModal();
      });
    },
    getModalButtonContainer: function() {
      return App.getRegion('regionModalFooter').$el.empty();
    },
    getButton: function(text, type) {
      if (type == null) {
        type = 'primary';
      }
      return $('<button>').addClass('btn btn-' + type).html(text);
    },
    defaultButtons: function(callback) {
      var $ok;
      $ok = API.getButton('Ok', 'primary').on('click', function() {
        if (callback) {
          callback();
        }
        return API.closeModal();
      });
      return API.getModalButtonContainer().append(API.closeModalButton()).append($ok);
    }
  };
  App.commands.setHandler("ui:textinput:show", function(title, msg, callback) {
    var $input, $msg;
    if (msg == null) {
      msg = '';
    }
    API.closeModal();
    $input = $('<input>', {
      id: 'text-input',
      "class": 'form-control',
      type: 'text'
    }).on('keyup', function(e) {
      if (e.keyCode === 13 && callback) {
        callback($('#text-input').val());
        return API.closeModal();
      }
    });
    $msg = $('<p>').html(msg);
    API.defaultButtons(function() {
      return callback($('#text-input').val());
    });
    API.openModal(title, $msg, callback);
    App.getRegion('regionModalBody').$el.append($input.wrap('<div class="form-control-wrapper"></div>')).find('input').first().focus();
    return $.material.init();
  });
  App.commands.setHandler("ui:modal:close", function() {
    return API.closeModal();
  });
  App.commands.setHandler("ui:modal:show", function(title, msg) {
    if (msg == null) {
      msg = '';
    }
    return API.openModal(title, msg);
  });
  return App.commands.setHandler("ui:modal:close", function() {
    return API.closeModal();
  });
});
