define(function (require) {
  const U = require('util')
  const R = require('ramda');
  const Rx = require('rx')
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

  function makeTrivialRouter(routerSpecs) {
    return function Router(sources, settings) {
      // routes = Observable<Url>
      const routes$ = sources.routes$
      return {
        DOM: routes$
          .map(route => {
            return routerSpecs[route] ?
              div(settings, routerSpecs[route]) :
              div('Game over : router is not configured for that route!')
          }),
        action$: routes$.flatMapLatest(route => {
          const containsParent = /child\/parent/gi;
          return containsParent.exec(route) ?
            $.return({action : 'child action', timestamp : Date.now()}) :
            $.empty()
        })
      }
    }
  }

  QUnit.module("Demoing the test helper", {})

  QUnit.test("Trivial router", function exec_test(assert) {
    let done = assert.async(3)

    const routes = {
      '/parent': 'Welcome to the parent!',
      '/parent/child': 'Welcome to the child!',
      '/parent/child/parent': 'Welcome to the other parent!',
      '/parent/child/parent/child': 'Welcome to the other child*&!',
    }
    const TrivialRouter = makeTrivialRouter(routes)

    const testSources = makeTestSources(['routes$'])
    const settings = '#main.nav'

    const analyzeTestResults = (actual, expected, message) => {
      assert.deepEqual(actual, expected, message)
      done()
    }

    const vNodes = [
      div(settings, routes['/parent']),
      div(settings, routes['/parent/child']),
      div(settings, routes['/parent/child/parent']),
      div(settings, routes['/parent/child/parent/child']),
      div('Game over : router is not configured for that route!'),
    ]

    const testCase = {
      inputs: {
        routes$: {
          diagram: 'abcde|', values: {
            a: '/parent',
            b: '/parent/child',
            c: '/parent/child/parent',
            d: '/parent/child/parent/child',
            e: '/whatever'
          }
        },
      },
      expected: {
        DOM: {
          outputs: vNodes,
          successMessage: 'sink DOM produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: undefined,
        },
        action$ : {
          outputs: [
            "child action",
            "child action"
          ],
          successMessage: 'sink action$ produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: x => x.action,
        }
      }
    }

    const testFn = sources => TrivialRouter(sources, settings)

    runTestScenario(testSources, testCase, testFn, {
      timeUnit: 10,
      waitForFinishDelay: 50
    })

  })
})
