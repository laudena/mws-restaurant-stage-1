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
  static get ADD_REVIEW_URL(){
    return `http://localhost:${DBHelper.PORT}/reviews/`;
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
