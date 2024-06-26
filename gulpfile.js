import browserSync from 'browser-sync';
import pkg from 'gulp';
const { src, lastRun, dest, watch, series, parallel, Gulp } = pkg;
import gulpif from 'gulp-if';
import rename from 'gulp-rename';
import plumber from 'gulp-plumber';
import notify from 'gulp-notify';
import imagemin from 'gulp-imagemin';
import mozjpeg from 'imagemin-mozjpeg';
import changed from 'gulp-changed';
import postcss from 'gulp-postcss';
import mqpacker from 'css-mqpacker';
import sortCSSmq from 'sort-css-media-queries';
import dartSass from 'sass';
import bulkSass from 'gulp-sass-glob-use-forward';
import gulpSass from 'gulp-sass';
const sass = gulpSass(dartSass);
import cleanCSS from 'gulp-clean-css';
import autoprefixer from 'autoprefixer';
import ejs from 'gulp-ejs';
import { rollup } from 'rollup';
import { deleteAsync } from 'del';
import path from 'path';
import minmax from 'postcss-media-minmax';

// Rollupの設定ファイル
import deploy from './rollup.config.js';

const paths = {
    rootDir: 'public',
    html: {
        src: 'src/ejs/**/*.ejs',
        tempSrc: 'src/ejs/**/_*.ejs',
        ignoreTempSrc: 'src/ejs/**/!(_)*.ejs',
        dest: 'public',
    },
    styles: {
        src: 'src/css/**/*.scss',
        dest: 'public/css',
    },
    scripts: {
        src: 'src/js/**/*.{js,jsx,ts,tsx}',
        dest: 'public/js',
    },
    images: {
        src: 'src/images/**/*.{jpg,jpeg,png,svg,gif}',
        dest: 'public/images',
    },
    static: {
        src: 'static/**/*.*',
        dest: 'public/',
    },
    dist: {},
};

// Browsersync <- Browsersyncによる再表示とローカルサーバー起動の設定
const server = browserSync.create();
const serve = (done) => {
    server.init({
        server: {
            baseDir: paths.rootDir,
            index: 'index.html',
        },
        online: true,
        open: false,
        reloadOnRestart: true,
    });
    done();
};
const reload = (done) => {
    server.reload();
    done();
};

/*
 * Clean
 */
const clean = () => deleteAsync(['public']);

/*
 * SCSS
 */
const styles = (done) => {
    src(paths.styles.src)
        .pipe(
            plumber({
                errorHandler: notify.onError('Error: <%= error.message %>'),
            })
        )
        .pipe(bulkSass())
        .pipe(
            sass.sync({
                outputStyle: 'expanded',
            })
        )
        .pipe(
            postcss([
                minmax(),
                autoprefixer(),
                mqpacker({
                    sort: sortCSSmq,
                }),
            ])
        )
        .pipe(gulpif(process.env.NODE_ENV === 'production', cleanCSS()))
        .pipe(dest(paths.styles.dest))
        .pipe(server.stream());
    done();
};

/*
 * HTML
 */
const html = (done) => {
    src(paths.html.ignoreTempSrc)
        .pipe(
            plumber({
                errorHandler: notify.onError('Error: <%= error.message %>'),
            })
        )
        .pipe(ejs())
        .pipe(
            rename({
                extname: '.html',
            })
        )
        .pipe(dest(paths.html.dest));
    done();
};

/*
 * Script
 */
let rollupCache = null;
const scripts = async (done) => {
    async function buildWithCache() {
        const bundle = await rollup({ ...deploy, ...{ cache: rollupCache } });
        rollupCache = bundle.cache;
        return bundle;
    }
    buildWithCache()
        .then((bundle) => {
            bundle.write(deploy.output);
        })
        .then(() => done())
        .catch((error) => console.error(error));
};

/*
 * Static
 */
const buildStatic = (done) => {
    src(paths.static.src).pipe(dest(paths.static.dest)).pipe(server.stream());
    done();
};

/*
 * Image
 */
const Imagemin = (done) => {
    src(paths.images.src)
        .pipe(changed(paths.images.dest))
        .pipe(imagemin([mozjpeg({ quality: 90 })]))
        .pipe(dest(paths.images.dest))
    .pipe(server.stream());
    done();
};

const watchFiles = () => {
    watch(paths.html.src, series(html, reload));
    watch(paths.scripts.src, series(scripts, reload));
    watch(paths.styles.src, styles);
    watch(paths.images.src, Imagemin);
    watch(paths.static.src, buildStatic);

    watch(paths.html.src).on('unlink', (filePath) => {
        if (!/^_/.test(path.parse(filePath).name))
            deleteAsync(filePath.replace(/src\/ejs/, paths.html.dest).replace(/.ejs$/, '.html'));
    });
    watch(paths.styles.src).on('unlink', (filePath) => {
        if (!/^_/.test(path.parse(filePath).name))
            deleteAsync(filePath.replace(/src\/css/, paths.styles.dest).replace(/.scss$/, '.css'));
    });

    watch(paths.images.src).on('unlink', (filePath) => deleteAsync(filePath.replace(/src\/img/, paths.images.dest)));
    watch(paths.images.src).on('change', (filePath) => deleteAsync(filePath.replace(/src\/img/, paths.images.dest)));
    watch(paths.static.src).on('unlink', (filePath) => deleteAsync(filePath.replace(/static/, paths.static.dest)));
    watch(paths.static.src).on('change', (filePath) => deleteAsync(filePath.replace(/static/, paths.static.dest)));
};

export const dist = series(buildStatic, parallel(styles, html, scripts, Imagemin));
export const dev = series(dist, serve, watchFiles);
export const production = series(dist, serve, watchFiles);
export const build = series(clean, dist);
export default dev;
