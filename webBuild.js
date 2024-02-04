const uglify = require("uglify-js");
const fs = require("fs");
const cleancss = require("clean-css");
const htmlminify = require('html-minifier');
if (fs.existsSync("dist")) fs.rmSync("dist", { recursive: true });
function checkDist(e) {
    if (!fs.existsSync(`dist/${e.substring(0, e.lastIndexOf("/"))}`)) fs.mkdirSync(`dist/${e.substring(0, e.lastIndexOf("/"))}`, { recursive: true });
}
let JSPath = ["script.js", "service-worker.js"];
JSPath.forEach(e => {
    checkDist(e);
    fs.writeFileSync(`dist/${e}`, `${e !== "service-worker.js" ? "(()=>{" : ""}${uglify.minify(fs.readFileSync(e, "utf-8"), { mangle: { toplevel: true } }).code}${e !== "service-worker.js" ? "})();" : ""}`);
});
let HTMLPath = ["index.html"];
HTMLPath.forEach(e => {
    checkDist(e);
    fs.writeFileSync(`dist/${e}`, htmlminify.minify(fs.readFileSync(e, "utf-8"), { minifyJS: true, minifyCSS: true, collapseWhitespace: true, conservativeCollapse: true }))
})
let CSSPath = ["style.css"];
CSSPath.forEach(e => {
    checkDist(e);
    fs.writeFileSync(`dist/${e}`, new cleancss().minify(fs.readFileSync(e, "utf-8")).styles)
})
let assets = ["update.txt", "manifest.json", "assets/icon.png", "assets/icon.svg"];
assets.forEach(e => {
    checkDist(e);
    fs.copyFileSync(e, `dist/${e}`);
})