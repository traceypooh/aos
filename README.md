# archive OS

Prototype to dynamically index archive.org items in a folder and allow basic browsing & metadata search


## Live demo
https://traceypooh.github.io/aos


## Try it yourself?
1. You can download multiple [archive.org](https://archive.org) items
    (in parallel, with resumption) to your laptop via:
  - https://internetarchive.github.io/ia/examples/download.html
2. If you save them into a subdirectory named `items`, in the parent directory containing `items`, you can create a file named `index.html` with the following contents:
```html
<!doctype html><meta charset="utf-8"/><script src="https://traceypooh.github.io/aos/js/index.js" type="module"></script>
```
3. You can now start any simple webserver on your laptop to _browse_ or _search_ the archive.org items.  A simple basic webserver can be fired up in a `terminal`, while in the directory containing the `items` sub-directory, eg:
```sh
python3 -m http.server 8000
```
4. Simply browse to http://localhost:8000/


## To Do
- save search index info into indexedDB and refresh every X hours
