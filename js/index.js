import lunr from 'https://esm.archive.org/lunr'
import XMLMapping from 'https://esm.archive.org/xml-mapping'
import { log, warnfull } from 'https://av.prod.archive.org/js/util/log.js'
import cgiarg from 'https://av.prod.archive.org/js/util/cgiarg.js'
import Dexie from 'https://esm.archive.org/dexie'


const TOP = location.pathname === '/' ? '/items/' : '/aos/items/'


class AOS {
  constructor() {
    this.docs = {}
    this.lunr = null
    this.metadata_keys = new Set()
  }

  async main() {
    const q = cgiarg('q')
    if (q === '') return // nothing to do

    // get a dir listing of the top dir (typically /items/)
    // so we can know what item directories we should index to our lunr JS search
    const ids = [...(await (await fetch(TOP)).text()).matchAll(/href="([^"]+)"/g)].map((e) => (e[1].startsWith('https://') ? null : e[1].replace(TOP, '').replace(/^\/+/, '').replace(/\/+$/, ''))).filter((e) => !!e && e !== 'items')
    log({ ids })

    // fetch each item's _meta.xml file
    for (const id of ids) {
      const xml = await (await fetch(`${TOP}${id}/${id}_meta.xml`)).text()

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
    let htm = '<h1>Search results:</h1>'
    for (const hit of hits) {
      const id = hit.ref
      htm += `
        <div class="card" style="">
          <a href="${TOP}${id}">
            <img class="card-img-top" src="${TOP}${id}/__ia_thumb.jpg"><br>
          </a>
          <div class="card-body">
            <h5 class="card-title">
              <a href="${TOP}${id}">
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
