//'use strict';

(function() {
  function toArray(arr) {
    return Array.prototype.slice.call(arr);
  }

  function promisifyRequest(request) {
    return new Promise(function(resolve, reject) {
      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onerror = function() {
        reject(request.error);
      };
    });
  }

  function promisifyRequestCall(obj, method, args) {
    var request;
    var p = new Promise(function(resolve, reject) {
      request = obj[method].apply(obj, args);
      promisifyRequest(request).then(resolve, reject);
    });

    p.request = request;
    return p;
  }

  function promisifyCursorRequestCall(obj, method, args) {
    var p = promisifyRequestCall(obj, method, args);
    return p.then(function(value) {
      if (!value) return;
      return new Cursor(value, p.request);
    });
  }

  function proxyProperties(ProxyClass, targetProp, properties) {
    properties.forEach(function(prop) {
      Object.defineProperty(ProxyClass.prototype, prop, {
        get: function() {
          return this[targetProp][prop];
        },
        set: function(val) {
          this[targetProp][prop] = val;
        }
      });
    });
  }

  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return this[targetProp][prop].apply(this[targetProp], arguments);
      };
    });
  }

  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function Index(index) {
    this._index = index;
  }

  proxyProperties(Index, '_index', [
    'name',
    'keyPath',
    'multiEntry',
    'unique'
  ]);

  proxyRequestMethods(Index, '_index', IDBIndex, [
    'get',
    'getKey',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(Index, '_index', IDBIndex, [
    'openCursor',
    'openKeyCursor'
  ]);

  function Cursor(cursor, request) {
    this._cursor = cursor;
    this._request = request;
  }

  proxyProperties(Cursor, '_cursor', [
    'direction',
    'key',
    'primaryKey',
    'value'
  ]);

  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
    'update',
    'delete'
  ]);

  // proxy 'next' methods
  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {
    if (!(methodName in IDBCursor.prototype)) return;
    Cursor.prototype[methodName] = function() {
      var cursor = this;
      var args = arguments;
      return Promise.resolve().then(function() {
        cursor._cursor[methodName].apply(cursor._cursor, args);
        return promisifyRequest(cursor._request).then(function(value) {
          if (!value) return;
          return new Cursor(value, cursor._request);
        });
      });
    };
  });

  function ObjectStore(store) {
    this._store = store;
  }

  ObjectStore.prototype.createIndex = function() {
    return new Index(this._store.createIndex.apply(this._store, arguments));
  };

  ObjectStore.prototype.index = function() {
    return new Index(this._store.index.apply(this._store, arguments));
  };

  proxyProperties(ObjectStore, '_store', [
    'name',
    'keyPath',
    'indexNames',
    'autoIncrement'
  ]);

  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'put',
    'add',
    'delete',
    'clear',
    'get',
    'getAll',
    'getKey',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'openCursor',
    'openKeyCursor'
  ]);

  proxyMethods(ObjectStore, '_store', IDBObjectStore, [
    'deleteIndex'
  ]);

  function Transaction(idbTransaction) {
    this._tx = idbTransaction;
    this.complete = new Promise(function(resolve, reject) {
      idbTransaction.oncomplete = function() {
        resolve();
      };
      idbTransaction.onerror = function() {
        reject(idbTransaction.error);
      };
      idbTransaction.onabort = function() {
        reject(idbTransaction.error);
      };
    });
  }

  Transaction.prototype.objectStore = function() {
    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
  };

  proxyProperties(Transaction, '_tx', [
    'objectStoreNames',
    'mode'
  ]);

  proxyMethods(Transaction, '_tx', IDBTransaction, [
    'abort'
  ]);

  function UpgradeDB(db, oldVersion, transaction) {
    this._db = db;
    this.oldVersion = oldVersion;
    this.transaction = new Transaction(transaction);
  }

  UpgradeDB.prototype.createObjectStore = function() {
    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
  };

  proxyProperties(UpgradeDB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(UpgradeDB, '_db', IDBDatabase, [
    'deleteObjectStore',
    'close'
  ]);

  function DB(db) {
    this._db = db;
  }

  DB.prototype.transaction = function() {
    return new Transaction(this._db.transaction.apply(this._db, arguments));
  };

  proxyProperties(DB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(DB, '_db', IDBDatabase, [
    'close'
  ]);

  // Add cursor iterators
  // TODO: remove this once browsers do the right thing with promises
  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
    [ObjectStore, Index].forEach(function(Constructor) {
      // Don't create iterateKeyCursor if openKeyCursor doesn't exist.
      if (!(funcName in Constructor.prototype)) return;

      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
        var args = toArray(arguments);
        var callback = args[args.length - 1];
        var nativeObject = this._store || this._index;
        var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
        request.onsuccess = function() {
          callback(request.result);
        };
      };
    });
  });

  // polyfill getAll
  [Index, ObjectStore].forEach(function(Constructor) {
    if (Constructor.prototype.getAll) return;
    Constructor.prototype.getAll = function(query, count) {
      var instance = this;
      var items = [];

      return new Promise(function(resolve) {
        instance.iterateCursor(query, function(cursor) {
          if (!cursor) {
            resolve(items);
            return;
          }
          items.push(cursor.value);

          if (count !== undefined && items.length == count) {
            resolve(items);
            return;
          }
          cursor.continue();
        });
      });
    };
  });

  var exp = {
    open: function(name, version, upgradeCallback) {
      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
      var request = p.request;

      if (request) {
        request.onupgradeneeded = function(event) {
          if (upgradeCallback) {
            upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
          }
        };
      }

      return p.then(function(db) {
        return new DB(db);
      });
    },
    delete: function(name) {
      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = exp;
    module.exports.default = module.exports;
  }
  else {
    self.idb = exp;
  }
}());
//import idb from 'idb';

const dbPromise = self.idb.open('store', 1, upgradeDB => {
  // Note: we don't use 'break' in this switch statement,
  // the fall-through behaviour is what we want.
  switch (upgradeDB.oldVersion) {
    case 0:
      upgradeDB.createObjectStore('obj', {keyPath: 'id'});
      
  }
});


/**
 * Common database helper functions.
 */
class DBHelper {

  /**
   * Database URL.
   * Change this to restaurants.json file location on your server.
   */
   static get PORT(){
    return 80;
   }
  static get DATABASE_URL() {
    //const port = 1337 // Change this to your server port

    //return `http://localhost:${DBHelper.PORT}/restaurants`;
    return `https://lauden-res-server.herokuapp.com/restaurants`;
  }

  static get REVIEWS_URL() {
    return `https://lauden-res-server.herokuapp.com/reviews/?restaurant_id=`;

  }
  static get ADD_REVIEW_URL(){
    return `https://lauden-res-server.herokuapp.com/reviews/`;
  }

  static get NOT_UPDATED_YET_DATE(){
    //return 'Not yet! (waiting for network)'
    return '1970-01-01T00:00:00.0Z';
  }

  /**
   * Fetch all restaurants.
   */
  static fetchRestaurants(callback) {
    fetch(DBHelper.DATABASE_URL,{method:'GET'})
      .then(function(response) { 
        console.log ('fetchRestaurants --> responses:' + response.length);
        return response.json(); 
      })
      .then(function(myJson) { 
        console.log ('myJson' + myJson);
        DBHelper.addRestaurantRecordsToDB(myJson);
        return myJson.sort(DBHelper.compareFavorites);
      })
      .then(callback)
      .catch(function (e) {
        console.log ('failed to download. attempting indexDB...' + e);
        dbPromise.then(db => {
          return db.transaction('obj')
              .objectStore('obj').get(9999);
          })
            .then(function(obj) {
            console.log('fetchRestaurants --> received from DB: ' + obj.length);
            return obj.data;
            })
            .then(callback);
        
        });
      
  }
 

/* compareFavorites - sort restaurants

make good use of the favorite feature - 
  reorder the restaurant, so the most favorites ones are on top! */

static compareFavorites(a,b) {
  if (a.is_favorite == "true" && b.is_favorite != "true")
    return -1;
  if (a.is_favorite != "true" && b.is_favorite == "true")
    return 1;
  return 0;
}




 static fetchReviewByRestaurantId(restaurant_id, callback) {
    

    console.log ('fetchReviewByRestaurantId --> entered');
    //first - check if any reviews need to be updated to server
    DBHelper.handlePostponedReviews(function(contin){

      console.log ('fetchReviewByRestaurantId --> callback started');
      if(!contin){
        console.log ('fetchReviewByRestaurantId --> stop fetch !');
        return;
      }
      const review_url = DBHelper.REVIEWS_URL+ restaurant_id;
      fetch(review_url ,{method:'GET'})
        .then(function(response) { 
          console.log ('response:' + response);
          return response.json(); 
        })
        .then(function(myJson) { 
          console.log ('myJson' + myJson);
          DBHelper.addRestaurantReviewsToDB(restaurant_id, myJson);
          return myJson;
        })
        .then(callback)
        .catch(function (e) {
          console.log ('failed to download. attempting indexDB...' + e);
          dbPromise.then(db => {
            return db.transaction('obj')
                .objectStore('obj').get(restaurant_id);
            })
              .then(function(obj) {
              console.log('received review of restaurant #'+restaurant_id+' from DB: ' + obj);
              if (obj != null)
                return obj.data;
              else
                return null;
              })
              .then(callback);
          
          });
      });
  }

 static addRestaurantRecordsToDB(obj){
  dbPromise.then(db => {
    const tx = db.transaction('obj', 'readwrite');
    tx.objectStore('obj').put({
      id: 9999,
      data: obj
      });
      return tx.complete;
  });
  }

 static addRestaurantReviewsToDB(restaurant_id, obj){
  dbPromise.then(db => {
    const tx = db.transaction('obj', 'readwrite');
    tx.objectStore('obj').put({
      id: restaurant_id,
      data: obj
      });
      return tx.complete;
  });
  }
  static addRestaurantSingleReviewToDB(restaurant_id, review){
  

    dbPromise.then(db => {
        return db.transaction('obj')
            .objectStore('obj').get(restaurant_id);
        })
          .then(function(obj) {
          console.log('addRestaurantSingleReviewToDB. Received reviews of restaurant #'+restaurant_id);
          if (obj != null){
            obj.data.push(review);
            return DBHelper.addRestaurantReviewsToDB(restaurant_id, obj.data)
          }
          else
            return null;
      });

  }
  static addNewReview(payload_data, addToDBWhenFailed, callback)
  {

    console.log('addNewReview --> started, append to dB? -' + addToDBWhenFailed)
    let fetchOptions = {
          method: "POST", 
          mode: "cors", 
          cache: "no-cache", 
          headers: {
              "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify(payload_data), // body data 
      }

    fetch(DBHelper.ADD_REVIEW_URL, fetchOptions)
      .then(function(response){
        console.log("addNewReview --> post outcome:" + response.statusText);
        return response;
      })
      .catch(function(error){
         console.log(`addNewReview --> Fetch Error =\n`, error);
         //let id = parseInt(payload_data.restaurant_id);
         if (addToDBWhenFailed)
          return DBHelper.addRestaurantSingleReviewToDB(payload_data.restaurant_id.toString(), payload_data)
        else
          return error;
      })
      .then (callback);
      // .then(function(response){
      //   DBHelper.fetchRestaurantById(parseInt(payload_data.restaurant_id), callback);
      //   fillReviewsHTML();
      // });

  }



   static handlePostponedReviews(callback){
    console.log ('handlePostponedReviews --> entered');
    
          dbPromise.then(db => {
            return db.transaction('obj')
                .objectStore('obj').getAll();
            })
              .then(function(request) {

                //outer loop - restaurants
                let promiseRequestArr = request.map(function(o){
                  
                    return new Promise(function (resolve_request, reject_request) {
                      if (o.id == 9999){
                        resolve_request();
                        return;
                      }
                        
                      console.log ('checking reviews of restaurant id:' + o.id);
                    
                      //inner loop - reviews in a restaurant
                      let promiseArr = o.data.map(function (item) {
                          // return the promise to array
                          return new Promise(function (resolve, reject) {
                            console.log ("scanning reviews: " + item.restaurant_id+","+item.name);
                            if (item.updatedAt == null)//DBHelper.NOT_UPDATED_YET_DATE)
                            {
                              //handle submission
                              console.log ("found item to resubmit: " + item.name);
                              item.updatedAt = null;
                              DBHelper.addNewReview(item, false, function(result){
                                console.log ("finshed updateing");
                                if (result.ok)
                                  resolve();
                                else
                                  reject();
                              })
                            }
                            else 
                              resolve();

                          });
                          
                      });
                      Promise.all(promiseArr)
                      .then(function(res){
                        resolve_request();
                      })
                      .catch(function(res){
                        reject_request();
                      });
                    });
                  
                });
                Promise.all(promiseRequestArr)
                .then(function(res){
                  console.log('promiseRequestArr succeedd '+ res);
                  callback(true);
                })
                .catch(function(res){
                  console.log('promiseRequestArr failed '+ res);
                  callback(true);
                });
                    
              });
            }



  /**
   * Fetch a restaurant by its ID.
   */
  static fetchRestaurantById(id, callback) {
    // fetch all restaurants with proper error handling.
    DBHelper.fetchRestaurants((restaurants, error) => {
      if (error) {
        callback(null, error);
      } else {
        const restaurant = restaurants.find(r => r.id == id);
        if (restaurant) { // Got the restaurant

          console.log ('fetchRestaurantById --> before fetchReviewByRestaurantId');
          //fetch more data on the specific restaurant
          DBHelper.fetchReviewByRestaurantId(id, (reviews, error) => {
            if (error){
              console.log('no review found for restaurant #'+id+'...');
              callback(restaurant, null);
            }
            else {
              if (Array.isArray(reviews)){
                restaurant.reviews = reviews;
              }
              else {
                restaurant.reviews = [];
                restaurant.reviews.push(reviews);
              }

              console.log('added reviews to restaurant #'+id+': ' + reviews.length);
              callback(restaurant, null);
            }
          });
          //with or without reviews - send the restaurant data         
        } else { // Restaurant does not exist in the database
          callback(null, 'Restaurant data does not exist');
        }
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   */
  static fetchRestaurantByCuisine(cuisine, callback) {
    // Fetch all restaurants  with proper error handling
    DBHelper.fetchRestaurants((restaurants, error) => {
      if (error) {
        callback(null, error);
      } else {
        // Filter restaurants to have only given cuisine type
        const results = restaurants.filter(r => r.cuisine_type == cuisine);
        callback(results, null);
      }
    });
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   */
  static fetchRestaurantByNeighborhood(neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((restaurants, error) => {
      if (error) {
        callback(null, error);
      } else {
        // Filter restaurants to have only given neighborhood
        const results = restaurants.filter(r => r.neighborhood == neighborhood);
        callback(results, null);
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
   */
  static fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((restaurants, error) => {
      if (error) {
        callback(null, error);
      } else {
        let results = restaurants
        if (cuisine != 'all') { // filter by cuisine
          results = results.filter(r => r.cuisine_type == cuisine);
        }
        if (neighborhood != 'all') { // filter by neighborhood
          results = results.filter(r => r.neighborhood == neighborhood);
        }
        callback(results, null);
      }
    });
  }

  /**
   * Fetch all neighborhoods with proper error handling.
   */
  static fetchNeighborhoods(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((restaurants, error) => {
      if (error) {
        callback(null, error);
      } else {
        // Get all neighborhoods from all restaurants
        const neighborhoods = restaurants.map((v, i) => restaurants[i].neighborhood)
        // Remove duplicates from neighborhoods
        const uniqueNeighborhoods = neighborhoods.filter((v, i) => neighborhoods.indexOf(v) == i)
        callback(uniqueNeighborhoods, null);
      }
    });
  }

  /**
   * Fetch all cuisines with proper error handling.
   */
  static fetchCuisines(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((restaurants, error) => {
      if (error) {
        callback(null, error);
      } else {
        // Get all cuisines from all restaurants
        const cuisines = restaurants.map((v, i) => restaurants[i].cuisine_type)
        // Remove duplicates from cuisines
        const uniqueCuisines = cuisines.filter((v, i) => cuisines.indexOf(v) == i)
        callback(uniqueCuisines, null);
      }
    });
  }

  /**
   * Restaurant page URL.
   */
  static urlForRestaurant(restaurant) {
    return (`./restaurant.html?id=${restaurant.id}`);
  }

  /**
     * Restaurant image URL.
     */
    static imageUrlForRestaurant(restaurant) {

      return (`/img/${restaurant.id}` + '.jpg');
    }
/**
   * Restaurant image description.
   */
  static imageDescriptionForRestaurant(restaurant) {

    //return (`${restaurant.photographDescription}`);
    return ('a restaurant with diners');
  }
  /**
   * Restaurant SOURCE SET.
   */
   static imageSrcsetForRestaurant(restaurant){
        let imageNameNoPrefix = restaurant.id;
        let isLargeWidth = window.matchMedia("screen and (min-width: 990px)").matches;
        if (isLargeWidth)
            return (`/img/final/${imageNameNoPrefix}-800_large_1x.jpg 1x, /img/final/${imageNameNoPrefix}-800_large_2x.jpg 2x`);
        else
            return (`/img/final/${imageNameNoPrefix}-400_small_1x.jpg 1x, /img/final/${imageNameNoPrefix}-400_small_2x.jpg 2x`);
   }

  /**
   * Map marker for a restaurant.
   */
  static mapMarkerForRestaurant(restaurant, map) {
    const marker = new google.maps.Marker({
      position: restaurant.latlng,
      title: restaurant.name,
      url: DBHelper.urlForRestaurant(restaurant),
      map: map,
      animation: google.maps.Animation.DROP}
    );
    return marker;
  }

  static toggleFavorite(restaurant_id, value){
    //http://localhost:1337/restaurants/9/?is_favorite=true
    let url = DBHelper.DATABASE_URL + "/"+restaurant_id+"/?is_favorite=" + value;
      let fetchOptions = {
        method: "PUT"
        }
 
       fetch(url, fetchOptions)
         .then(function(response){
          console.log("toggleFavorite --> post outcome:" + response.statusText);
           return response;
         });
  }
}

let restaurants,
  neighborhoods,
  cuisines
var map
var markers = []

/**
 * Fetch neighborhoods and cuisines as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', (event) => {
  fetchNeighborhoods();
  fetchCuisines();
});



//import IndexController from './IndexController';
//const polyfillsNeeded = [];
//
//if (!('Promise' in self)) polyfillsNeeded.push('/js/polyfills/promise.js');
//
//try {
//  new URL('b', 'http://a');
//}
//catch (e) {
//  polyfillsNeeded.push('/js/polyfills/url.js');
//}

//loadScripts(polyfillsNeeded, function() {
  //new IndexController(document.querySelector('.main'));
//});





/**
 * Fetch all neighborhoods and set their HTML.
 */
fetchNeighborhoods = () => {
  DBHelper.fetchNeighborhoods((neighborhoods, error) => {
    if (error) { // Got an error
      console.error(error);
    } else {
      self.neighborhoods = neighborhoods;
      fillNeighborhoodsHTML();
    }
  });
}

/**
 * Set neighborhoods HTML.
 */
fillNeighborhoodsHTML = (neighborhoods = self.neighborhoods) => {
  const select = document.getElementById('neighborhoods-select');
  neighborhoods.forEach(neighborhood => {
    const option = document.createElement('option');
    option.innerHTML = neighborhood;
    option.value = neighborhood;
    select.append(option);
  });
}

/**
 * Fetch all cuisines and set their HTML.
 */
fetchCuisines = () => {
  DBHelper.fetchCuisines((cuisines, error) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.cuisines = cuisines;
      fillCuisinesHTML();
    }
  });
}

/**
 * Set cuisines HTML.
 */
fillCuisinesHTML = (cuisines = self.cuisines) => {
  const select = document.getElementById('cuisines-select');

  cuisines.forEach(cuisine => {
    const option = document.createElement('option');
    option.innerHTML = cuisine;
    option.value = cuisine;
    select.append(option);
  });
}

/**
 * Initialize Google map, called from HTML.
 */
window.initMap = () => {
  let loc = {
    lat: 40.722216,
    lng: -73.987501
  };
  self.map = new google.maps.Map(document.getElementById('map'), {
    zoom: 12,
    center: loc,
    scrollwheel: false
  });
  updateRestaurants();
}

/**
 * Update page and map for current restaurants.
 */
updateRestaurants = () => {
  const cSelect = document.getElementById('cuisines-select');
  const nSelect = document.getElementById('neighborhoods-select');

  const cIndex = cSelect.selectedIndex;
  const nIndex = nSelect.selectedIndex;

  const cuisine = cSelect[cIndex].value;
  const neighborhood = nSelect[nIndex].value;

  DBHelper.fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, (restaurants, error ) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      resetRestaurants(restaurants);
      fillRestaurantsHTML();
    }
  })
}

/**
 * Clear current restaurants, their HTML and remove their map markers.
 */
resetRestaurants = (restaurants) => {
  // Remove all restaurants
  self.restaurants = [];
  const ul = document.getElementById('restaurants-list');
  ul.innerHTML = '';

  // Remove all map markers
  self.markers.forEach(m => m.setMap(null));
  self.markers = [];
  self.restaurants = restaurants;
}

/**
 * Create all restaurants HTML and add them to the webpage.
 */
fillRestaurantsHTML = (restaurants = self.restaurants) => {
  const ul = document.getElementById('restaurants-list');
  restaurants.forEach(restaurant => {
    ul.append(createRestaurantHTML(restaurant));
  });
  addMarkersToMap();
}

/**
 * Create restaurant HTML.
 */
createRestaurantHTML = (restaurant) => {
  const li = document.createElement('li');

  const image = document.createElement('img');
  image.className = 'restaurant-img';
    image.src = DBHelper.imageUrlForRestaurant(restaurant);
    image.srcset = DBHelper.imageSrcsetForRestaurant(restaurant);
    image.alt = DBHelper.imageDescriptionForRestaurant(restaurant);
  li.append(image);

  const name = document.createElement('h2');
  name.innerHTML = restaurant.name;
  li.append(name);

  const neighborhood = document.createElement('p');
  neighborhood.innerHTML = restaurant.neighborhood;
  li.append(neighborhood);

  const address = document.createElement('p');
  address.innerHTML = restaurant.address;
  li.append(address);

  const more = document.createElement('a');
  more.innerHTML = 'View Details';
  more.setAttribute("aria-label", "View details of " + restaurant.name +" restaurant");
  more.href = DBHelper.urlForRestaurant(restaurant);
  li.append(more)
  
  const favorite = document.createElement('input');
  favorite.type = "checkbox";
  favorite.id = 'favorite_checkbox';
  favorite.checked = restaurant.is_favorite.toUpperCase() == "TRUE";
  favorite.setAttribute("aria-label", "Favorite indicator for"  + restaurant.name);
  favorite.addEventListener("click", function () {
    DBHelper.toggleFavorite(restaurant.id, this.checked);
  });
  const favorite_label = document.createElement('label');
  favorite_label.innerHTML = "Favorite!";
  favorite_label.for = 'favorite_checkbox';


  li.append(favorite);
  li.append(favorite_label);

  return li
}

/**
 * Add markers for current restaurants to the map.
 */
addMarkersToMap = (restaurants = self.restaurants) => {
  restaurants.forEach(restaurant => {
    // Add marker to the map
    const marker = DBHelper.mapMarkerForRestaurant(restaurant, self.map);
    google.maps.event.addListener(marker, 'click', () => {
      window.location.href = marker.url
    });
    self.markers.push(marker);
  });
}
