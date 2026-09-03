// `#lib` resolves here. Nothing is re-exported on purpose: a barrel file that
// re-exports the whole library drags every module into every bundle that
// touches any of it. Import the file you mean.
export {};
