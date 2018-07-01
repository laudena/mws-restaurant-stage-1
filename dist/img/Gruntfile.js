module.exports = function(grunt) {

  grunt.initConfig({
    responsive_images: {
      dev: {
        options: {
          //engine: 'im',
          sizes: [
		  {
            width: 800,
            suffix: '_large_1x',
            quality: 50
          },
		  {
            width: 800,
            suffix: '_large_2x',
            quality: 100
          },
		  // {
            // width: 400,
            // suffix: '_small_1x',
            // quality: 50
          // },
		  // {
            // width: 400,
            // suffix: '_small_2x',
            // quality: 100
          // },
		  ]
        },
        files: [{
          expand: true,
          src: ['*.{gif,jpg,png}'],
          cwd: './big',
          dest: 'final/'
        }]
      }
    },
  });

  grunt.loadNpmTasks('grunt-responsive-images');
  grunt.registerTask('default', ['responsive_images']);

};
