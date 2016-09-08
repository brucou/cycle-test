"use strict";
define(function (require) {
  const U = require('util')
  const R = require('ramda');
  const Rx = require('rx')
  const Router = require('components/Router')
  const routeMatcher = require('route_matcher').routeMatcher
  const $ = Rx.Observable
  const Sdom = require('cycle-snabbdom')
  const h = Sdom.h
  const div = Sdom.div
  const span = Sdom.span
  const tutils = require('test_util')
  const runTestScenario = tutils.runTestScenario
  const m = U.m
  const mapR = R.map
  const reduceR = R.reduce
  const makeTestSources = tutils.makeTestSources
  const projectSinksOn = U.projectSinksOn

  QUnit.module("Testing Router component", {})

  QUnit.skip("main cases - non-nested routing", function exec_test(assert) {
    let done = assert.async(4)

    const childComponent1 = function childComponent1(sources, settings) {
      return {
        DOM: sources.DOM1.take(4)
          .tap(console.warn.bind(console, 'DOM : component 1: '))
          .map(x => h('span', {},
            'Component 1 : id=' + settings.routeParams.id + ' - ' + x))
          .concat($.never()),
        routeLog: sources.route$
          .tap(console.warn.bind(console, 'routeLog : component 1 - route$'))
          .map(x => 'Component 1 - routeLog - ' +
          settings.routeParams.user + settings.routeParams.id),
        a: sources.userAction$.map(x => 'Component1 - user action - ' + x)
      }
    }
    const childComponent2 = function childComponent1(sources, settings) {
      return {
        DOM: sources.DOM2.take(4)
          .tap(console.warn.bind(console, 'DOM : component 2: '))
          .map(x => h('span', {},
            'Component 2 : id=' + settings.routeParams.id + ' - ' + x))
          .concat($.never()),
        routeLog: sources.route$
          .tap(console.warn.bind(console, 'routeLog : component 2 - route$'))
          .map(x => 'Component2 - routeLog - routeRemainder: ' + x),
        b: sources.userAction$.map(x => 'Component2 - user action - ' + x)
      }
    }

    const mComponent = m(Router,
      {route: ':user/:id', sinkNames: ['DOM', 'routeLog', 'a', 'b']},
      [childComponent1, childComponent2])

    const inputs = [
      {DOM1: {diagram: '-a--b--c--d--e--f--a--b--c--d-'}},
      {DOM2: {diagram: '-a-b-c-d-e-f-abb-c-d-e-f-'}},
      {
        userAction$: {
          diagram: 'a---b-ac--ab---c',
          values: {a: 'click', b: 'select', c: 'hover',}
        }
      },
      {
        route$: {
          //diagr: '-a--b--c--d--e--f--a--b--c--d--e--f-',
          //diagr: '-a-b-c-d-e-f-abb-c-d-e-f-',
          diagram: '-a---b--cdef--g', values: {
            a: 'bruno/1',
            b: 'ted',
            c: 'bruno/2',
            d: 'bruno/2/remainder',
            e: 'bruno/2/remainder',
            f: 'bruno/3/bigger/remainder',
            g: 'paul',
          }
        }
      }
    ]

    function makeVNode(componentNum, id, x) {
      return h('span', {},
        'Component ' + componentNum + ' : id=' + id + ' - ' + x)
    }

    const vNodes = [
      div([
        makeVNode(1, 1, 'b'),
        makeVNode(2, 1, 'b'),
      ]),
      div([
        makeVNode(1, 1, 'b'),
        makeVNode(2, 1, 'c'),
      ]),
      div([
        makeVNode(1, 2, 'd'),
        makeVNode(2, 2, 'e'),
      ]),
      div([
        makeVNode(1, 2, 'd'),
        makeVNode(2, 2, 'f'),
      ]),
      div([
        makeVNode(1, 3, 'e'),
        makeVNode(2, 3, 'a'),
      ]),
      div([
        makeVNode(1, 3, 'e'),
        makeVNode(2, 3, 'b'),
      ]),
    ]

    /** @type TestResults */
    const expected = {
      DOM: {
        outputs: vNodes,
        successMessage: 'sink DOM produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      routeLog: {
        outputs: [
          "Component 1 - routeLog - bruno1",
          "Component2 - routeLog - routeRemainder: undefined",
          "Component 1 - routeLog - bruno2",
          "Component2 - routeLog - routeRemainder: undefined",
          "Component 1 - routeLog - bruno2",
          "Component2 - routeLog - routeRemainder: remainder",
          "Component 1 - routeLog - bruno2",
          "Component2 - routeLog - routeRemainder: remainder",
          "Component 1 - routeLog - bruno3",
          "Component2 - routeLog - routeRemainder: bigger/remainder"
        ],
        successMessage: 'sink routeLog produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      a: {
        outputs: [
          "Component1 - user action - select",
          "Component1 - user action - click",
          "Component1 - user action - select"
        ],
        successMessage: 'sink a produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      b: {
        outputs: [
          "Component2 - user action - select",
          "Component2 - user action - click",
          "Component2 - user action - select"
        ],
        successMessage: 'sink b produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
    }

    function analyzeTestResults(actual, expected, message) {
      assert.deepEqual(actual, expected, message)
      done()
    }

    const testFn = mComponent

    runTestScenario(inputs, expected, testFn, {
      tickDuration: 10,
      waitForFinishDelay: 100
    })

  })

  // m(Router, {route: '/:user/'}, [
  //   m(Component1, [
  //     m(Router, {route: '/:id'}, [
  //       Component2
  //     ])
  //   ])
  // ])

  QUnit.test("main cases - nested routing", function exec_test(assert) {
    let done = assert.async(4)
    let counter = 0

    const childComponent = {
      makeOwnSinks: function (sources, settings) {
        console.group("executing childComponent own")
        console.log('sources, settings', sources, settings)
        console.groupEnd("executing childComponent own")
        let user = settings.routeParams.user
        console.error('settings.routeParams user', user, ++counter)

        return {
          DOM: sources.DOM1.take(4)
            .tap(console.warn.bind(console, 'DOM : child component : '))
            .map(x => h('span', {},
              'Child component : id=' + user + ' - ' + x))
            .concat($.never()),
          routeLog: sources.route$
            .tap(console.warn.bind(console, 'routeLog : child component -' +
              ' route$'))
            .map(function(x) {
            return 'Child component 1 - routeLog - ' + user //+ '-' + counter
            }),
          userAction1$: sources.userAction$.map(x => 'child component - user' +
          ' action - ' + x).startWith('child component - starting')
        }
      }
    }

    const greatChildComponent = function greatChildComponent(sources, settings) {
      console.group("executing greatChildComponent own")
      console.log('sources, settings', sources, settings)
      console.groupEnd("executing childComponent own")

      return {
        DOM: sources.DOM2.take(4)
          .tap(console.warn.bind(console, 'DOM : great child component : '))
          .map(x => h('span', {},
            'Great child component : id=' + settings.routeParams.id + ' - ' + x))
          .concat($.never()),
        routeLog: sources.route$
          .tap(console.warn.bind(console, 'routeLog : great child component -' +
            ' route$'))
          .map(x => [
            'great child component - routeLog -',
            '(user: ' + settings.routeParams.user + ',',
            'id: ' + settings.routeParams.id + ')'
          ].join(' ')),
        userAction2$: sources.userAction$.map(x => 'great child component -' +
        ' user action - ' + x).startWith('great child component - starting'),
        notMerged: sources.DOM1.map(x => 'ERROR')
          .tap(console.log.bind(console, 'notMerged:'))
      }
    }

    // TODO : be careful about mutation of sinkNames... it is passed down
    // the children, so only need to use it once, but what if we need a
    // different sinknames at a lower level?? should be fine but better test
    console.groupCollapsed('creating mComponent')
    const mComponent = m(Router,
      {
        route: ':user',
        sinkNames: ['DOM', 'routeLog', 'userAction1$', 'userAction2$'],
        trace: 'top'
      },
      [
        m(childComponent, {trace: 'middle'}, [
          m(Router, {route: ':id', trace: 'bottom'}, [greatChildComponent])
        ])
      ])
    console.groupEnd('creating mComponent')

    // sources : route$, DOM1, DOM2, userAction$
    // greatChildComponent : routeLog <- route, settings; DOM <- DOM2,
    // userAction2$ <- userAction$,
    // notMerged (dont put in sinkNames, to check that it is not merged)
    // childComponent : routeLog <- route, settings; DOM <- DOM1,
    // userAction1$ <- userAction$

    const inputs = [
      {DOM1: {diagram: '-a--b--c--d--e--f--a--b--c--d-'}},
      {DOM2: {diagram: '-a-b-c-d-e-f-a-b-c-d-e-f-'}},
      {
        userAction$: {
          diagram: 'a---b-ac--aba--c',
          values: {a: 'click', b: 'select', c: 'hover',}
        }
      },
      {
        route$: {
          //diagr: '-a--b--c--d--e--f--a--b--c--d-'}},
          //diagr: '-a-b-c-d-e-f-a-b-c-d-e-f-'}},
          //userA: 'a---b-ac--aba--c',
          diagram: '-a---b--cdef--g-h-', values: {
            a: 'bruno/1',
            b: 'ted',
            c: 'bruno/2',
            d: 'bruno/2/remainder',
            e: 'bruno/2/remainder',
            f: 'bruno/3/bigger/remainder',
            g: '',
            h: undefined,
          }
        }
      }
    ]

    function makeVNode(componentNum, id, x) {
      return h('span', {},
        'Component ' + componentNum + ' : id=' + id + ' - ' + x)
    }

    const vNodes = []

    /** @type TestResults */
    const expected = {
      DOM: {
        outputs: vNodes,
        successMessage: 'sink DOM produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      routeLog: {
        outputs: [],
        successMessage: 'sink routeLog produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      userAction1$: {
        outputs: [
          "child component - starting",
          "child component - user action - select",
          "child component - starting",
          "child component - user action - click",
          "child component - user action - hover",
          "child component - starting",
          "child component - user action - click",
          "child component - user action - select",
          "child component - user action - click",
          "child component - starting",
          "child component - user action - hover",
        ],
        successMessage: 'sink userAction1$ produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      userAction2$: {
        outputs: [
          "great child component - starting",
          "great child component - user action - select",
          "great child component - starting",
          "great child component - user action - click",
          "great child component - user action - select",
          "great child component - starting",
          "great child component - user action - click"
        ],
        successMessage: 'sink userAction2$ produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
    }

    function analyzeTestResults(actual, expected, message) {
      assert.deepEqual(actual, expected, message)
      done()
    }

    const testFn = mComponent

    runTestScenario(inputs, expected, testFn, {
      tickDuration: 10,
      waitForFinishDelay: 100
    })

  })

})
