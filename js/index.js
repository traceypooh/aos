import lunr from 'https://esm.archive.org/lunr'
import XMLMapping from 'https://esm.archive.org/xml-mapping'
import { log, warnfull } from 'https://av.prod.archive.org/js/util/log.js'
import cgiarg from 'https://av.prod.archive.org/js/util/cgiarg.js'


const TOP = '/items/'

let LUNR
let metadata_keys = new Set()

async function main() {
  const ids = [...(await (await fetch(TOP)).text()).matchAll(/href="([^"]+)"/g)].map((e) => (e[1].startsWith(TOP) ? e[1].replace(TOP, '').replace(/^\/+/, '').replace(/\/+$/, '') : null)).filter((e) => !!e)
  log({ ids })

  const docs = []
  for (const id of ids) {
    const xml = await (await fetch(`${TOP}${id}/${id}_meta.xml`)).text()

    // eslint-disable-next-line no-use-before-define
    const kvs = xml_to_map(xml)
    kvs.url = `${TOP}${id}`
    docs.push(kvs)
    metadata_keys = new Set([...metadata_keys, ...new Set(Object.keys(kvs))])
  }

  log({ metadata_keys })
  // eslint-disable-next-line no-use-before-define
  index(docs)


  const q = cgiarg('q')
  if (q)
    document.write(`<pre>${JSON.stringify(LUNR.search(q), null, 2)}</pre>`)
}


function index(docs) {
  // Builds the index so Lunr can search it.  The `ref` field will hold the URL
  // to the page/post.  title, excerpt, and body will be fields searched.
  LUNR = lunr(function adder() {
    this.ref('url')
    for (const key of [...metadata_keys])
      this.field(key)

    // Loop through all documents and add them to index so they can be searched
    for (const doc of docs)
      this.add(doc)
  })
  warnfull(LUNR)
}


// (Modified lightly from https://av.prod.archive.org/js/util/files-xml.js )
/**
 * Parses item XML file to JSON object.  Expected to be key/val like (eg: _meta.xml)
 * or array of key/vals (eg: _files.xml)
 *
 * @param {string} xml XML string
 */
function xml_to_map(xml = '') {
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
            // this betta be an array! -- safeguard w/ Object.values() in case is an object not ary.
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


// eslint-disable-next-line no-void
void main()
