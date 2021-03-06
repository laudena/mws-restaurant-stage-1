//var basePath = __dirname + "/..";
//var http = require('http');
//var fs = require('fs');
//var path = require('path');
//
//http.createServer(function(req, res) {
//    var stream = fs.createReadStream(path.join(basePath, req.url));
//    stream.on('error', function() {
//        res.writeHead(404);
//        res.end();
//    });
//    stream.pipe(res);
//}).listen(8080);

const server=require('node-http-server');

server.deploy(
    {
        port: process.env.PORT || 8080,
        root:__dirname + "/../dist"
    },
    serverReady
);


function serverReady(server){
   console.log( `Server on port ${server.config.port} is now up`);
}