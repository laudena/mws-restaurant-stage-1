module.exports = function (grunt) {
  grunt.initConfig({
    cwebp: {
      dynamic: {
        options: {
          q: 50
        },
        files: [{
          expand: true,
          cwd: 'final/', 
          src: ['**/*.{png,jpg,gif}'],
          dest: '../dist/img/final'
        }]
      }
    }
  });
 
  grunt.loadNpmTasks('grunt-cwebp');
  grunt.registerTask('default', ['cwebp']);
};