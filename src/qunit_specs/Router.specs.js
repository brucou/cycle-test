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

  QUnit.test("main cases - non-nested routing", function exec_test(assert) {
    let done = assert.async(4)

    const childComponent1 = function childComponent1(sources, settings) {
      return {
        DOM: $.interval(40).take(4)
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
        DOM: $.interval(20).take(4)
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

    const testSources = makeTestSources(
      ['DOM', 'route$', 'userAction$']
    )

    const vNodes = []

    function analyzeTestResults(actual, expected, message) {
      assert.deepEqual(actual, expected, message)
      done()
    }

    /** @type TestCase */
    const testCase = {
      inputs: {
        userAction$: {
          diagram: 'a---b-ac--ab--c', values: {
            a: 'click',
            b: 'select',
            c: 'hover',
          }
        },
        route$: {
          diagram: '-a---b--cd-e-f', values: {
            a: 'bruno/1',
            b: 'ted',
            c: 'bruno/2',
            d: 'bruno/2/remainder',
            e: 'bruno/3/remainder',
            f: 'paul',
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
        routeLog: {
          outputs: [
            "Component 1 - routeLog - bruno1",
            "Component2 - routeLog - routeRemainder: undefined",
            "Component 1 - routeLog - bruno2",
            "Component2 - routeLog - routeRemainder: undefined",
            "Component 1 - routeLog - bruno2",
            "Component2 - routeLog - routeRemainder: remainder",
            "Component 1 - routeLog - bruno3",
            "Component2 - routeLog - routeRemainder: remainder"
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
    }

    const testFn = mComponent

    runTestScenario(testSources, testCase, testFn, {
      timeUnit: 50,
      waitForFinishDelay: 100
    })

  })

})
