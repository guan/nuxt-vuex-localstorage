import Crypto from 'nuxt-vuex-localstorage/plugins/crypto'
import expire from 'nuxt-vuex-localstorage/plugins/bindStorage/expire'
import Vue from 'vue'

const storageFunction = (() => {
  try {
    const storage = {
      local: window.localStorage,
      session: window.sessionStorage
    }
    storage.local.setItem('__local_test', 1)
    storage.local.removeItem('__local_test')
    storage.session.setItem('__session_test', 1)
    storage.session.removeItem('__session_test')

    return require('nuxt-vuex-localstorage/plugins/bindStorage/webStorage')
  } catch (e) {
    return require('nuxt-vuex-localstorage/plugins/bindStorage/cookie')
  }
})()

export default async (ctx, options) => {
  const store = ctx.store
  const crypto = await new Crypto(ctx, options)
  let localStoreNames = options.localStorage || ['localStorage']
  if (typeof options.localStorage === 'string') localStoreNames = [options.localStorage]
  let sessionStoreNames = options.sessionStorage || ['sessionStorage']
  if (typeof options.sessionStorage === 'string') sessionStoreNames = [options.sessionStorage]
  const versionPropName = options.versionPropName || 'version'

  const watchFunction_local = (i, val) => {
    const data = JSON.stringify(expire.create(val))
    storageFunction.local.set(localStoreNames[i], crypto.encrypt(data))
  }

  let watchHandlers_local = []
  const watcher_local = (name, i) => {
    return store.watch(state => { return state[name] },
      val => watchFunction_local(i, val),
      { deep: true })
  }
  
  const bindLocalStorage = (name, i) => {
    const localPersist = JSON.parse(crypto.decrypt(storageFunction.local.get(name)))
    let data = { ...store.state }
    if (expire.check(localPersist)[versionPropName] === store.state[name][versionPropName])
      data[name] = { ...data[name], ...expire.check(localPersist), status: true }
    store.replaceState(data)

    localStoreNames.forEach((name, i) => {
      watchHandlers_local[i] = watcher_local(name, i)
    })
  }

  const watchOtherBrowsersLocalStorage = () => {
    window.addEventListener('storage', (event) => {
      if (event && event.storageArea === localStorage && Object.keys(store.state).indexOf(event.key) >= 0) {
        watchHandlers_local.forEach(e => e())
        let data = { ...store.state }
        data[event.key] = JSON.parse(crypto.decrypt(event.newValue))
        store.replaceState(data)
        localStoreNames.forEach((name, i) => {
          watchHandlers_local[i] = watcher_local(name, i)
        })
      }
    })
  }

  const watchFunction_session = (i, val) => {
    const data = JSON.stringify(expire.create(val))
    storageFunction.session.set(sessionStoreNames[i], crypto.encrypt(data))
  }

  let watchHandlers_session = []
  const watcher_session = (name, i) => {
    return store.watch(state => { return state[name] },
      val => watchFunction_session(i, val),
      { deep: true })
  }

  const bindSessionStorage = (name, i) => {
    const sessionPersist = JSON.parse(crypto.decrypt(storageFunction.session.get(name)))
    let data = { ...store.state }
    if (expire.check(sessionPersist)[versionPropName] === store.state[name][versionPropName])
      data[name] = { ...data[name], ...expire.check(sessionPersist), status: true }
    store.replaceState(data)

    sessionStoreNames.forEach((name, i) => {
      watchHandlers_session[i] = watcher_session(name, i)
    })
  }
  
  switch (options.mode) {
    case 'manual':
      watchOtherBrowsersLocalStorage()
      Vue.prototype.$setWebStorageKey = (key, salt, keyMixTimes, keyLength) => crypto.setKey(key, salt, keyMixTimes, keyLength)
      let localStorageStatusWatchers = []
      localStoreNames.forEach((name, i) => {
        localStorageStatusWatchers.push(store.watch(state => { return state[name].status }, val => {
          if (val) {
            bindLocalStorage(name, i)
            localStorageStatusWatchers[i]()
          }
        }, { deep: true }))
      })
      let sessionStorageStatusWatchers = []
      sessionStoreNames.forEach((name, i) => {
        sessionStorageStatusWatchers.push(store.watch(state => { return state.sessionStorage }, val => {
          if (val.status) {
            bindSessionStorage(name, i)
            sessionStorageStatusWatchers[i]()
          }
        }, { deep: true }))
      })
      break
    default:
      localStoreNames.forEach((name, i) => {
        watchOtherBrowsersLocalStorage()
        bindLocalStorage(name, i)
      })
      sessionStoreNames.forEach((name, i) => {
        bindSessionStorage(name, i)
      })
      break
  }
}
