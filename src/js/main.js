define(function (require) {
  const Rx = require('rx')
  const utils = require('util')
  const Cycle = require('cycle')
  //    const toHTML = require('vdomtohtml')
  const Sdom = require('cycle-snabbdom')
  const makeDOMDriver = Sdom.makeDOMDriver
  const makeHTMLDriver = Sdom.makeHTMLDriver
  const h = Sdom.h
  const h2 = Sdom.h2
  const div = Sdom.div
  const span = Sdom.span
  const Mclass = require('snabbdom_class')
  const Mprops = require('snabbdom_props')
  const Mstyle = require('snabbdom_style')
  const Mattributes = require('snabbdom_attributes')

  const modules = [Mclass, Mprops, Mstyle, Mattributes]
  const $ = Rx.Observable

  // console.log('sdom', Sdom)

  function makeFakeRouterDriver() {
    return function routerDriver(routeIntent$) {
      routeIntent$.tap(console.log.bind(console, 'routerDriver : routeIntent$ :'))
    }
  }

  function makeFakeAuthDriver() {
    return function authDriver(authIntent$) {
      authIntent$.tap(console.log.bind(console, 'authDriver : authIntent$ :'))
    }
  }

  function makeFakeQueueDriver() {
    return function queueDriver(queueIntent$) {
      queueIntent$.tap(console.log.bind(console, 'queueDriver : queueIntent$ :'))
    }
  }

  var drivers = {
    DOM: makeDOMDriver('#app', {transposition: false, modules}),
    router: makeFakeRouterDriver(),
    auth$: makeFakeAuthDriver(),
    queue$: makeFakeQueueDriver(),
  };

  function main(sources) {

    return {
      DOM: $.of(h2('BMI is '))
    }
  }

  // NOTE : Implements a circular flow with : main(drivers(replayS)).subscribe(replayS)
  Cycle.run(main, drivers);

  // Test input 3
  // No children, settings : {}, full component def(sink DOM, auth,
  //   queue, extra source user$) using the extra sources created

  const mComponent = m({
    makeLocalSources: (sources, settings) => {
      return {
        user$: $.of(settings),
      }
    },
    makeLocalSettings: settings => ({localSetting: 'local setting'}),
    makeOwnSinks: (sources, settings) => ({
      DOM: $.combineLatest(sources.user$, user => h('div#container.two.classes', {}, [
        h('span', {style: {fontWeight: 'bold'}}, user.key),
        ' and this is local settings',
        h('span', {style: {fontWeight: 'italic'}}, settings.localSetting),
      ])),
      auth$: sources.auth$.startWith(PROVIDERS.google),
    }),
    mergeSinks: (parentSinks, childrenSinks, settings) => ({
      DOM: parentSinks.DOM,
      auth$: parentSinks.auth$,
      user$: parentSinks.user$,
      childrenSinks$: $.of(childrenSinks),
      settings$: $.of(settings),
    }),
    sinksContract: [function checkMSinksContracts() {return true}]
  }, null, [])

  const fakeSources = {
    DOM: new ReplaySubject(1),
    auth$: new ReplaySubject(1),
  }
  const fakeSettings = {key: 'parent settings'}

  const actualSinks = mComponent(fakeSources, fakeSettings)
  // Auth test data
  makeSourceFromDiagram('-a|', {values: {a: PROVIDERS.facebook}})
    .subscribe(fakeSources.auth$)
  console.log('actualSinks', actualSinks)

  actualSinks.DOM.subscribe(console.log.bind(console, 'DOM:'))
  actualSinks.auth$.subscribe(console.log.bind(console, 'auth$:'))
  // actualSinks.user$.subscribe(console.log.bind(console,'user$:'))
  actualSinks.childrenSinks$.subscribe(console.log.bind(console, 'childrenSinks$:'))
  actualSinks.settings$.subscribe(console.log.bind(console, 'settings$:'))

});
