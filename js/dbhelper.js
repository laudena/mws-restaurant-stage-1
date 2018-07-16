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
    return 1337;
   }
  static get DATABASE_URL() {
    //const port = 1337 // Change this to your server port
    return `http://localhost:${DBHelper.PORT}/restaurants`;
  }

  static get REVIEWS_URL() {
    return `http://localhost:${DBHelper.PORT}/reviews/?restaurant_id=`;

  }

  /**
   * Fetch all restaurants.
   */
  static fetchRestaurants(callback) {
    fetch(DBHelper.DATABASE_URL,{method:'GET'})
      .then(function(response) { 
        console.log ('response:' + response);
        return response.json(); 
      })
      .then(function(myJson) { 
        console.log ('myJson' + myJson);
        DBHelper.addRestaurantRecordsToDB(myJson);
        return myJson;
      })
      .then(callback)
      .catch(function (e) {
        console.log ('failed to download. attempting indexDB...' + e);
        dbPromise.then(db => {
          return db.transaction('obj')
              .objectStore('obj').get(9999);
          })
            .then(function(obj) {
            console.log('received from DB: ' + obj);
            return obj.data;
            })
            .then(callback);
        
        });
      
  }
 
 static fetchReviewByRestaurantId(restaurant_id, callback) {
    const review_url = DBHelper.REVIEWS_URL+ restaurant_id;
    fetch(review_url ,{method:'GET'})
      .then(function(response) { 
        console.log ('response:' + response);
        return response.json(); 
      })
      .then(function(myJson) { 
        console.log ('myJson' + myJson);
        DBHelper.addReviewToDB(restaurant_id, myJson);
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

 static addReviewToDB(restaurant_id, obj){
  dbPromise.then(db => {
    const tx = db.transaction('obj', 'readwrite');
    tx.objectStore('obj').put({
      id: restaurant_id,
      data: obj
      });
      return tx.complete;
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

              console.log('added reviews to restaurant #'+id+': ' + reviews);
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

}
