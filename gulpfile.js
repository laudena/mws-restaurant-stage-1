/*eslint-env node */

var gulp = require('gulp');
var sass = require('gulp-sass');
var autoprefixer = require('gulp-autoprefixer');
var browserSync = require('browser-sync').create();
//var eslint = require('gulp-eslint_d');
//var jasmine = require('gulp-jasmine-phantom');
var concat = require('gulp-concat');
//var uglify = require('gulp-uglify');
var imagemin = require('gulp-imagemin');
var imageminWebp = require('imagemin-webp');
//var pngquant= require('imagemin-pngquant');

gulp.task('default', ['copy-html', 'copy-images', 'styles', 'lint',  'main-scripts'], function() {
	gulp.watch('sass/**/*.scss', ['styles']);
	gulp.watch('js/**/*.js', ['lint']);
	gulp.watch('/index.html', ['copy-html']);
	gulp.watch('./dist/index.html').on('change', browserSync.reload);

	browserSync.init({
		server: './dist'
	});
});

gulp.task('dist', [
	'copy-html',
	'copy-images',
	'styles',
	'lint',
	'scripts-dist'
]);

//why?
//b/c I couldn't merge into all.js without errors  "export" and "import" keywords
gulp.task('scripts', function() {

});

gulp.task('main-scripts', function() {
	gulp.src(['js/idb.js', 'js/dbhelper.js', 'js/main.js'])
		.pipe(concat('allmain.js'))
		//.pipe(uglify())
		.pipe(gulp.dest('dist/js'));
	gulp.src(['js/idb.js', 'js/dbhelper.js', 'js/restaurant_info.js'])
		.pipe(concat('allrestaurant.js'))
		//.pipe(uglify())
		.pipe(gulp.dest('dist/js'));
	gulp.src('sw.js')
		.pipe(gulp.dest('dist'));
	

	// gulp.src('js/main.js')
	// 	//.pipe(uglify())
	// 	.pipe(gulp.dest('dist/js'));
	// gulp.src('js/restaurant_info.js')
	// 	//.pipe(uglify())
	// 	.pipe(gulp.dest('dist/js'));
});

gulp.task('copy-html', function() {
	gulp.src(['./index.html', './restaurant.html'])
		.pipe(gulp.dest('./dist'));
});

gulp.task('copy-images', function() {
	gulp.src('img/final/*.{jpg,png}')
		.pipe(imagemin({
			progressive: true,
			use: [imageminWebp()]
		}))
		.pipe(gulp.dest('dist/img/final'));
});

gulp.task('styles', function() {
	gulp.src('sass/**/*.scss')
		.pipe(sass({
			outputStyle: 'compressed'
		}).on('error', sass.logError))
		.pipe(autoprefixer({
			browsers: ['last 2 versions']
		}))
		.pipe(gulp.dest('dist/css'))
		.pipe(browserSync.stream());
});

gulp.task('lint', function () {
	return;
	 //gulp.src(['js/**/*.js'])
		// eslint() attaches the lint output to the eslint property
		// of the file object so it can be used by other modules.
	//.pipe(eslint())
		// eslint.format() outputs the lint results to the console.
		// Alternatively use eslint.formatEach() (see Docs).
	//.pipe(eslint.format())
		// To have the process exit with an error code (1) on
		// lint error, return the stream and pipe to failOnError last.
	//.pipe(eslint.failOnError());
	
});

// gulp.task('tests', function () {
// 	gulp.src('tests/spec/extraSpec.js')
// 		.pipe(jasmine({
// 			integration: true,
// 			vendor: 'js/**/*.js'
// 		}));
// });