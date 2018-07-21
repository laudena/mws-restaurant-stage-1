var staticCacheName = 'rest-static-v8';
var contentImgsCache = 'rest-content-imgs';
var allCaches = [
  staticCacheName,
  contentImgsCache
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(staticCacheName).then(function(cache) {
      return cache.addAll([
        '/js/allmain.js',
        '/js/allrestaurant.js',
        '/css/styles.css',
        '/index.html',
        '/restaurant.html',
        //'/data/restaurants.json',
        'http://localhost:1337/restaurants'
      ]);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          return cacheName.startsWith('rest-') &&
                 !allCaches.includes(cacheName);
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  var requestUrl = new URL(event.request.url);

  if (requestUrl.origin === location.origin) {
    if (requestUrl.pathname.startsWith('/img/')) {
          event.respondWith(servePhoto(event.request));
          return;
        }
    if (requestUrl.pathname.startsWith('/restaurant.html') && requestUrl.search.startsWith('?id=')) {
          event.respondWith(servePage(event.request));
          return;
        }
    if (requestUrl.pathname === '/') {
      event.respondWith(servePage('index.html'));
      return;
    }
    
    if (requestUrl.pathname.startsWith('/css') || requestUrl.pathname.startsWith('/js')) {
      event.respondWith(servePage(event.request));
      return;
    }
  }

  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request) || 'Not Found';
    })
    //.catch(function (e) { return 'not found ' + e; })
    );
});


function servePhoto(request) {
  var storageUrl = request.url.replace(/-\d+px\.jpg$/, '');

  return caches.open(contentImgsCache).then(function(cache) {
    return cache.match(storageUrl).then(function(response) {
      if (response) return response;

      return fetch(request).then(function(networkResponse) {
        cache.put(storageUrl, networkResponse.clone());
        return networkResponse || '<h2>Sorry, no photo found...</h2>';
      });
    });
  });
}

function servePage(request) {
  var storageUrl = request.url;

  return caches.open(staticCacheName).then(function(cache) {
    return cache.match(storageUrl).then(function(response) {
      if (response) return response;

      return fetch(request).then(function(networkResponse) {
        cache.put(storageUrl, networkResponse.clone());
        return networkResponse || '<h2>Sorry, no cached data...</h2>';
      });
    });
  });
}

self.addEventListener('message', function(event) {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});