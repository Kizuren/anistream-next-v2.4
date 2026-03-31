"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/uncrypto";
exports.ids = ["vendor-chunks/uncrypto"];
exports.modules = {

/***/ "(rsc)/./node_modules/uncrypto/dist/crypto.node.cjs":
/*!****************************************************!*\
  !*** ./node_modules/uncrypto/dist/crypto.node.cjs ***!
  \****************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nconst nodeCrypto = __webpack_require__(/*! node:crypto */ \"node:crypto\");\n\nfunction _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }\n\nconst nodeCrypto__default = /*#__PURE__*/_interopDefaultCompat(nodeCrypto);\n\nconst subtle = nodeCrypto__default.webcrypto?.subtle || {};\nconst randomUUID = () => {\n  return nodeCrypto__default.randomUUID();\n};\nconst getRandomValues = (array) => {\n  return nodeCrypto__default.webcrypto.getRandomValues(array);\n};\nconst _crypto = {\n  randomUUID,\n  getRandomValues,\n  subtle\n};\n\nexports[\"default\"] = _crypto;\nexports.getRandomValues = getRandomValues;\nexports.randomUUID = randomUUID;\nexports.subtle = subtle;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvdW5jcnlwdG8vZGlzdC9jcnlwdG8ubm9kZS5janMiLCJtYXBwaW5ncyI6IkFBQWE7O0FBRWIsOENBQTZDLEVBQUUsYUFBYSxFQUFDOztBQUU3RCxtQkFBbUIsbUJBQU8sQ0FBQyxnQ0FBYTs7QUFFeEMscUNBQXFDOztBQUVyQzs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsa0JBQWU7QUFDZix1QkFBdUI7QUFDdkIsa0JBQWtCO0FBQ2xCLGNBQWMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9hbmltZWRleC8uL25vZGVfbW9kdWxlcy91bmNyeXB0by9kaXN0L2NyeXB0by5ub2RlLmNqcz80MjE3Il0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsICdfX2VzTW9kdWxlJywgeyB2YWx1ZTogdHJ1ZSB9KTtcblxuY29uc3Qgbm9kZUNyeXB0byA9IHJlcXVpcmUoJ25vZGU6Y3J5cHRvJyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wRGVmYXVsdENvbXBhdCAoZSkgeyByZXR1cm4gZSAmJiB0eXBlb2YgZSA9PT0gJ29iamVjdCcgJiYgJ2RlZmF1bHQnIGluIGUgPyBlLmRlZmF1bHQgOiBlOyB9XG5cbmNvbnN0IG5vZGVDcnlwdG9fX2RlZmF1bHQgPSAvKiNfX1BVUkVfXyovX2ludGVyb3BEZWZhdWx0Q29tcGF0KG5vZGVDcnlwdG8pO1xuXG5jb25zdCBzdWJ0bGUgPSBub2RlQ3J5cHRvX19kZWZhdWx0LndlYmNyeXB0bz8uc3VidGxlIHx8IHt9O1xuY29uc3QgcmFuZG9tVVVJRCA9ICgpID0+IHtcbiAgcmV0dXJuIG5vZGVDcnlwdG9fX2RlZmF1bHQucmFuZG9tVVVJRCgpO1xufTtcbmNvbnN0IGdldFJhbmRvbVZhbHVlcyA9IChhcnJheSkgPT4ge1xuICByZXR1cm4gbm9kZUNyeXB0b19fZGVmYXVsdC53ZWJjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKGFycmF5KTtcbn07XG5jb25zdCBfY3J5cHRvID0ge1xuICByYW5kb21VVUlELFxuICBnZXRSYW5kb21WYWx1ZXMsXG4gIHN1YnRsZVxufTtcblxuZXhwb3J0cy5kZWZhdWx0ID0gX2NyeXB0bztcbmV4cG9ydHMuZ2V0UmFuZG9tVmFsdWVzID0gZ2V0UmFuZG9tVmFsdWVzO1xuZXhwb3J0cy5yYW5kb21VVUlEID0gcmFuZG9tVVVJRDtcbmV4cG9ydHMuc3VidGxlID0gc3VidGxlO1xuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/uncrypto/dist/crypto.node.cjs\n");

/***/ })

};
;