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

  const drivers = {
    DOM: makeDOMDriver('#app', {transposition: false, modules}),
    router: makeFakeRouterDriver(),
    auth$: makeFakeAuthDriver(),
    queue$: makeFakeQueueDriver(),
  }

  function main(sources) {

    return {
      DOM: $.of(h2('BMI is '))
    }
  }

  // NOTE : Implements a circular flow with : main(drivers(replayS)).subscribe(replayS)
  Cycle.run(main, drivers);

});
