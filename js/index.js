import lunr from 'https://esm.archive.org/lunr'
import XMLMapping from 'https://esm.archive.org/xml-mapping'
import { log, warnfull } from 'https://av.prod.archive.org/js/util/log.js'
import cgiarg from 'https://av.prod.archive.org/js/util/cgiarg.js'
import Dexie from 'https://esm.archive.org/dexie'


const ITEMS = location.pathname === '/' ? '/items/' : '/aos/items/'
const TOP = location.pathname === '/' ? '/' : '/aos/'

const HEADER = `
<link href="https://esm.archive.org/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" type="text/css"/>
<style>
  body { padding:50px; }
  .card {
    max-width: 300px;
    display: inline-block;
    vertical-align: top;
  }
</style>
`

class AOS {
  constructor() {
    this.docs = {}
    this.lunr = null
    this.metadata_keys = new Set()
  }

  async main() {
    const q = cgiarg('q')
    const mdapi = location.search?.slice(1).match(/metadata\/(.*)/)?.pop()
    const details = location.search?.slice(1).match(/details\/(.*)/)?.pop()
    if (mdapi) {
      document.querySelector('body').innerHTML = JSON.stringify(await AOS.mdapi(mdapi))
      return
    }
    if (details) {
      AOS.details(details)
      return
    }

    if (q === '') {
      document.querySelector('body').innerHTML = `
${HEADER}
<h1>
  Welcome to Archive OS
</h1>

<hr>


<h2>Search:</h2>
<form>
  <input type="text" name="q" placeholder="enter text to search item metadata" size="50"/>
  <input type="submit" class="btn btn-sm btn-primary"/>
</form>


<h2>Browse:</h2>
<a href="items/">items/</a>
`
      return
    }

    // get a dir listing of the top dir (typically /items/)
    // so we can know what item directories we should index to our lunr JS search
    const ids = [...(await (await fetch(ITEMS)).text()).matchAll(/href="([^"]+)"/g)].map((e) => (e[1].startsWith('https://') ? null : e[1].replace(ITEMS, '').replace(/^\/+/, '').replace(/\/+$/, ''))).filter((e) => !!e && e !== 'items')
    log({ ids })

    // fetch each item's _meta.xml file
    for (const id of ids) {
      const xml = await (await fetch(`${ITEMS}${id}/${id}_meta.xml`)).text()

      const kvs = AOS.xml_to_map(xml)
      kvs.id = id
      this.docs[id] = kvs
      // maintain a list of all unique _meta.xml top-level name elements are found
      // (so we can index them all, with their values)
      this.metadata_keys = new Set([...this.metadata_keys, ...new Set(Object.keys(kvs))])
    }
    log('mdkeys', this.metadata_keys)

    // index all the documents into our search
    this.search_index()

    // await this.store()

    // search for the query and dump results/info to the page
    const hits = this.lunr.search(q)
    let htm = `${HEADER} <h1>Search results:</h1>`
    for (const hit of hits) {
      const id = hit.ref
      const href = `${TOP}?details/${id}` // `${ITEMS}${id}`
      htm += `
        <div class="card" style="">
          <a href="${href}">
            <img class="card-img-top" src="${ITEMS}${id}/__ia_thumb.jpg"><br>
          </a>
          <div class="card-body">
            <h5 class="card-title">
              <a href="${href}">
                ${this.docs[id].title ?? ''}
              </a>
            </h5>
            <p class="card-text">
              ${this.docs[id].description ?? ''}
            </p>
          </div>
        </div>`
    }
    htm += `<hr>Search info:<pre>${JSON.stringify(hits, null, 2)}</pre>`
    document.querySelector('body').innerHTML = htm
  }


  static async mdapi(id) {
    const xml = await (await fetch(`${ITEMS}${id}/${id}_meta.xml`)).text()
    return {
      files: Object.values(AOS.xml_to_map(await (await fetch(`${ITEMS}${id}/${id}_files.xml`)).text())),
      metadata: AOS.xml_to_map(xml),
    }
  }


  static async details(id) {
    const md = await AOS.mdapi(id)

    document.querySelector('body').classList.add('navia')
    document.querySelector('body').classList.add('responsive')

    const e = document.createElement('style')
    e.setAttribute('type', 'text/css')
    e.appendChild(document.createTextNode(`
    /* like bootstrap */
    *, *:before, *:after {
      -webkit-box-sizing: border-box;
      -moz-box-sizing: border-box;
      box-sizing: border-box;
    }
    body {
      font-family: "Helvetica Neue",Helvetica,Arial,sans-serif;
      font-size: 14px;
      line-height: 1.428;
      border: 0;
      margin: 0;
      padding: 0;
      margin-top: -5px; /* xxx duno why i have to do this */
    }
    @font-face {
      /* iconochive glyphs */
      font-family: 'Iconochive-Regular';
      src:url('https://archive.org/includes/fonts/Iconochive-Regular.eot?-ccsheb');
      src:url('https://archive.org/includes/fonts/Iconochive-Regular.eot?#iefix-ccsheb') format('embedded-opentype'),
        url('https://archive.org/includes/fonts/Iconochive-Regular.woff?-ccsheb') format('woff'),
        url('https://archive.org/includes/fonts/Iconochive-Regular.ttf?-ccsheb') format('truetype'),
        url('https://archive.org/includes/fonts/Iconochive-Regular.svg?-ccsheb#Iconochive-Regular') format('svg');
      font-weight: normal;
      font-style: normal;
    }`))
    const head = document.getElementsByTagName('head')[0]
    head.appendChild(e)

    document.querySelector('body').innerHTML = `<div id="wrap">
      <main id="maincontent">
        <details-page id="${id}">
          <div id="light-slot-id" slot="light-slot"></div>
        </details-page>
        <div class="container-ia"></div><!-- this is for play.js to "size" theatre width -->
      </main>
    </div>`

    document.querySelector('details-page').mdapi = md

    await import('https://av.prod.archive.org/js/details-page.js')


    const e2 = document.createElement('h2')
    e2.style.textAlign = 'center'
    e2.innerHTML = `<a href="${ITEMS}${id}">ITEM FILES</a>`
    document.getElementById('maincontent').appendChild(e2)
  }


  search_index() {
    // Builds the index so Lunr can search it.  The `ref` field will hold the URL
    // to the page/post.
    // All fields/keys found in item _meta.xml will be fields that get searched.
    // deno-lint-ignore no-this-alias
    const self = this
    this.lunr = lunr(function adder() {
      this.ref('id')
      for (const key of [...self.metadata_keys])
        this.field(key)

      // Loop through all documents and add them to index so they can be searched
      for (const doc of Object.values(self.docs))
        this.add(doc)
    })
    warnfull(this.lunr)
  }


  async store() {
    const db = new Dexie('aosDB')
    db.version(1).stores({
      items: 'id,metadata',
      lunr: 'lunr',
    })

    try { // xxx
      await db.lunr.add({ lunr: JSON.stringify(this.lunr) })

      for (const [id, metadata] of Object.entries(this.docs))
        await db.items.add({ id, metadata })
        /* eslint-disable-next-line no-empty */ // deno-lint-ignore no-empty
    } catch {}

    await db.open()
    const xxx = await db.items.where('id').equals('commute').toArray()
    log({ xxx })
  }


  // (Modified lightly from https://av.prod.archive.org/js/util/files-xml.js )
  /**
   * Parses item XML file to JSON object.  Expected to be key/val like (eg: _meta.xml)
   * or array of key/vals (eg: _files.xml)
   *
   * @param {string} xml XML string
   */
  static xml_to_map(xml = '') {
    const ret = {}
    const opts = { throwErrors: true }
    const map = XMLMapping.load(xml, opts)
    const keys = Object.keys(map)

    // cheating w/ _files.xml specifics for now...
    if (JSON.stringify(keys) === '["files"]'  &&  typeof map.files === 'object'  &&
      JSON.stringify(Object.keys(map.files)) === '["file"]'
    ) {
      const files = [].concat(map.files.file) // ensure is an array (eg: single <file> scenario)
      for (const file of files) {
        const fileKV = {}
        for (const [k, v] of Object.entries(file)) {
          if (typeof v === 'string') {
            fileKV[k] = v
          } else if (typeof v === 'object') {
            if ('$t' in v) {
              fileKV[k] = v.$t
            } else {
              // must be an array! -- safeguard w/ Object.values() in case is an object not ary.
              // also, punt empty arrays, eg: <file><title></title></file>
              const vv = Object.values(v)
              if (vv.length)
                fileKV[k] = vv.map((e) => e.$t)
            }
          } else {
            throw Error(`key ${k} has unexpected value ${v}`)
          }
        }
        ret[fileKV.name] = fileKV
      }
      return ret
    }

    for (const [k, v] of Object.entries(keys.length === 1 ? map[keys[0]] : map)) {
      if ('$t' in v) {
        // value is singleton
        ret[k] = v.$t.trim()
      } else {
        // value is an array of singletons
        ret[k] = []
        for (const aryV of Object.values(v)) {
          if (typeof aryV.$t === 'undefined' && typeof aryV === 'object' && !Object.values(aryV).length) {
            // eg: k === 'description', aryV === {}
            // delete ret[k]
            /* eslint-disable-next-line no-continue */
            continue
          }
          ret[k].push(aryV.$t.trim())
        }
      }
      if (!ret[k].length)
        delete ret[k]
    }
    return ret
  }
}


// eslint-disable-next-line no-void
void new AOS().main()
