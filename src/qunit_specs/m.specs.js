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

  // Fixtures
  const PROVIDERS = {
    google: 'google',
    facebook: 'facebook',
  }

  QUnit.module("Testing m helper", {})

  QUnit.test("m(component_def, settings, children) : edge cases", function exec_test(assert) {
    //    let done = assert.async(3)

    assert.throws(function () {m()}, /fails/,
      'it throws an exception if it is called with an invalid ' +
      'combination of arguments')

  })

  QUnit.test(
    "m(component_def, settings, children) : main cases - only children components",
    function exec_test(assert) {
      let done = assert.async(4)

      // Test case 2
      // 2 children: [component (sink DOM, a, c), component(sink DOM, a, d)], settings : {...}, no component_def, no local sources
      //   + sources : DOM, a, b, c, d, e
      //   + output.sinks = children component sinks merged with default values of the component_def
      //   + i.e. sinkNames = [DOM, auth, route, queue], DOM is merged with default,
      //     auth is merged with both, queue, route merged with 1
      //   + settings are taken into account (have all of the sinks depend on settings differently)

      const testSettings = {main: 'parent settings'}

      const childComponent1 = function childComponent1(sources, settings) {
        return {
          DOM: $.combineLatest(sources.a, user => h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, settings.main),
          ])),
          a: sources.b.map(x => 'child1-a-' + x),
          c: sources.c.map(x => 'child1-c-' + x),
        }
      }
      const childComponent2 = function childComponent1(sources, settings) {
        return {
          DOM: $.combineLatest(sources.a, user => h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, settings.local),
          ])),
          a: sources.d.map(x => 'child2-a-' + x),
          d: sources.e.map(x => 'child2-e-' + x),
        }
      }

      const mComponent = m({
        makeLocalSettings: settings => ({local: 'local setting'}),
      }, testSettings, [childComponent1, childComponent2])

      const testSources = makeTestSources(['DOM', 'a', 'b', 'c', 'd', 'e'])

      const vNodes = [
        // 1
        div([
          h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, testSettings.main),
          ]),
          h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'local setting'),
          ]),
        ]),
        // 2
        div([
          h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, testSettings.main),
          ]),
          h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'local setting'),
          ]),
        ]),// 3
        div([
          h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, testSettings.main),
          ]),
          h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'local setting'),
          ]),
        ]),
      ]

      function analyzeTestResults(actual, expected, message) {
        assert.deepEqual(actual, expected, message)
        done()
      }

      /** @type TestCase */
      const testCase = {
        inputs: {
          a: {diagram: 'ab|', values: {a: 'a-0', b: 'a-1'}},
          b: {diagram: 'abc|', values: {a: 'b-0', b: 'b-1', c: 'b-2'}},
          c: {diagram: 'abc|', values: {a: 'c-0', b: 'c-1', c: 'c-2'}},
          d: {diagram: 'a-b|', values: {a: 'd-0', b: 'd-2'}},
          e: {diagram: 'a|', values: {a: 'e-0'}},
        },
        expected: {
          DOM: {
            outputs: vNodes,
            successMessage: 'sink DOM produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          a: {
            outputs: [
              "child1-a-b-0",
              "child2-a-d-0",
              "child1-a-b-1",
              "child1-a-b-2",
              "child2-a-d-2"
            ],
            successMessage: 'sink a produces the expected values',
            analyzeTestResults: analyzeTestResults,
          },
          c: {
            outputs: ["child1-c-c-0", "child1-c-c-1", "child1-c-c-2"],
            successMessage: 'sink c produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          d: {
            outputs: ["child2-e-e-0"],
            successMessage: 'sink d produces the expected values',
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

  QUnit.test("m(component_def, settings, children) : main cases - no children", function exec_test(assert) {
    let done = assert.async(5)

    // Test input 4
    // No children, settings : ?, full component def(sink DOM, auth,
    //   queue, extra source user$) using the extra sources created

    const vNode = {
      "children": [
        {
          "children": undefined,
          "data": {
            "style": {
              "fontWeight": "bold"
            }
          },
          "elm": undefined,
          "key": undefined,
          "sel": "span",
          "text": "parent settings"
        },
        {
          "children": undefined,
          "data": undefined,
          "elm": undefined,
          "key": undefined,
          "sel": undefined,
          "text": " and this is local settings"
        },
        {
          "children": undefined,
          "data": {
            "style": {
              "fontWeight": "italic"
            }
          },
          "elm": undefined,
          "key": undefined,
          "sel": "span",
          "text": "local setting"
        }
      ],
      "data": {},
      "elm": undefined,
      "key": undefined,
      "sel": "div#container.two.classes",
      "text": undefined
    }

    const testSettings = {key: 'parent settings'}

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

    const testSources = {
      DOM: new Rx.ReplaySubject(1),
      auth$: new Rx.ReplaySubject(1),
    }

    function analyzeTestResults(actual, expected, message) {
      assert.deepEqual(actual, expected, message)
      done()
    }

    /** @type TestCase */
    const testCase = {
      inputs: {
        auth$: {diagram: '-a|', values: {a: PROVIDERS.facebook}},
      },
      expected: {
        DOM: {
          outputs: [vNode],
          successMessage: 'sink DOM produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: undefined,
        },
        auth$: {
          outputs: ['google', 'facebook'],
          successMessage: 'sink auth produces the expected values',
          analyzeTestResults: analyzeTestResults,
        },
        user$: {
          outputs: [],
          successMessage: 'sink user produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: undefined,
        },
        childrenSinks$: {
          outputs: [[]],
          successMessage: 'sink childrenSinks produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: undefined,
        },
        settings$: {
          outputs: [{
            "key": "parent settings",
            "localSetting": "local setting"
          }],
          successMessage: 'sink settings produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: undefined,
        },
      }
    }

    const testFn = function mComponentTestFn(settings) {
      return function _mComponentTestFn(sources) {
        return mComponent(sources, settings)
      }
    }

    runTestScenario(testSources, testCase, testFn(testSettings), {
      timeUnit: 10,
      waitForFinishDelay: 30
    })
  })

  QUnit.test(
    "m(component_def, settings, children) : main cases - children components and parent component - default merge",
    function exec_test(assert) {
      let done = assert.async(5)

      // Test case 4
      // 4 children: [component, component], settings : {...}, full component def (DOM, queue, auth, action)

      const testSettings = null

      const childComponent1 = function childComponent1(sources, settings) {
        return {
          DOM: $.combineLatest(sources.a, a => h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, 'child1-' + a),
          ])),
          a: sources.b.map(x => 'child1-a-' + x),
          c: sources.c.map(x => 'child1-c-' + x),
        }
      }
      const childComponent2 = function childComponent1(sources, settings) {
        return {
          DOM: $.combineLatest(sources.a, a => h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'child2-' + a),
          ])),
          a: sources.d.map(x => 'child2-a-' + x),
          d: sources.e.map(x => 'child2-e-' + x),
        }
      }

      const mComponent = m({
        makeLocalSources: (sources, settings) => {
          return {
            user$: $.of(settings),
          }
        },
        makeOwnSinks: (sources, settings) => ({
          DOM: $.of(div('.parent')),
          auth$: sources.auth$.startWith(PROVIDERS.google),
        }),
        sinksContract: [function checkMSinksContracts() {return true}]

      }, testSettings, [childComponent1, childComponent2])

      const testSources = makeTestSources(['DOM', 'auth$', 'a', 'b', 'c', 'd', 'e'])

      const vNodes = [
        div('.parent', [
          h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, 'child1-a-0'),
          ]),
          h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'child2-a-0'),
          ]),
        ]),
        div('.parent', [
          h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, 'child1-a-1'),
          ]),
          h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'child2-a-0'),
          ]),
        ]),
        div('.parent', [
          h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, 'child1-a-1'),
          ]),
          h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'child2-a-1'),
          ]),
        ]),
      ]

      function analyzeTestResults(actual, expected, message) {
        assert.deepEqual(actual, expected, message)
        done()
      }

      /** @type TestCase */
      const testCase = {
        inputs: {
          auth$: {diagram: 'a|', values: {a: 'auth-0'}},
          a: {diagram: 'ab|', values: {a: 'a-0', b: 'a-1'}},
          b: {diagram: 'abc|', values: {a: 'b-0', b: 'b-1', c: 'b-2'}},
          c: {diagram: 'abc|', values: {a: 'c-0', b: 'c-1', c: 'c-2'}},
          d: {diagram: 'a-b|', values: {a: 'd-0', b: 'd-2'}},
          e: {diagram: 'a|', values: {a: 'e-0'}},
        },
        expected: {
          DOM: {
            outputs: vNodes,
            successMessage: 'sink DOM produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          auth$: {
            outputs: ["google", "auth-0"],
            successMessage: 'sink auth$ produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          a: {
            outputs: [
              "child1-a-b-0",
              "child2-a-d-0",
              "child1-a-b-1",
              "child1-a-b-2",
              "child2-a-d-2"
            ],
            successMessage: 'sink a produces the expected values',
            analyzeTestResults: analyzeTestResults,
          },
          c: {
            outputs: ["child1-c-c-0", "child1-c-c-1", "child1-c-c-2"],
            successMessage: 'sink c produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          d: {
            outputs: ["child2-e-e-0"],
            successMessage: 'sink d produces the expected values',
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

  QUnit.test(
    "m(component_def, settings, children) : main cases - children components and parent component - customized merge",
    function exec_test(assert) {
      let done = assert.async(5)

      const testSettings = null

      const childComponent1 = function childComponent1(sources, settings) {
        return {
          DOM: $.combineLatest(sources.a, a => h('div', {}, [
            h('span', {style: {fontWeight: 'bold'}}, 'child1-' + a),
          ])),
          a: sources.b.map(x => 'child1-a-' + x),
          c: sources.c.map(x => 'child1-c-' + x),
        }
      }
      const childComponent2 = function childComponent1(sources, settings) {
        return {
          DOM: $.combineLatest(sources.a, a => h('div', {}, [
            h('span', {style: {fontWeight: 'italic'}}, 'child2-' + a),
          ])),
          a: sources.d.map(x => 'child2-a-' + x),
          d: sources.e.map(x => 'child2-e-' + x),
        }
      }

      const mComponent = m({
        makeLocalSources: (sources, settings) => {
          return {
            user$: $.of(settings),
          }
        },
        makeOwnSinks: (sources, settings) => ({
          DOM: $.of(div('.parent')),
          auth$: sources.auth$.startWith(PROVIDERS.google),
        }),
        mergeSinks: (parentSinks, childrenSinks, settings) => ({
          DOM: parentSinks.DOM,
          auth$: parentSinks.auth$,
          user$: parentSinks.user$,
          childrenSinks$: $.merge(projectSinksOn('DOM', childrenSinks)),
          settings$: $.of(settings),
        }),
        sinksContract: [function checkMSinksContracts() {return true}]

      }, testSettings, [childComponent1, childComponent2])

      const testSources = makeTestSources(['DOM', 'auth$', 'a', 'b', 'c', 'd', 'e'])

      const vNodes = [
        {
          "children": undefined,
          "data": {},
          "elm": undefined,
          "key": undefined,
          "sel": "div.parent",
          "text": undefined
        }
      ]

      function analyzeTestResults(actual, expected, message) {
        assert.deepEqual(actual, expected, message)
        done()
      }

      /** @type TestCase */
      const testCase = {
        inputs: {
          auth$: {diagram: 'a|', values: {a: 'auth-0'}},
          a: {diagram: 'ab|', values: {a: 'a-0', b: 'a-1'}},
          b: {diagram: 'abc|', values: {a: 'b-0', b: 'b-1', c: 'b-2'}},
          c: {diagram: 'abc|', values: {a: 'c-0', b: 'c-1', c: 'c-2'}},
          d: {diagram: 'a-b|', values: {a: 'd-0', b: 'd-2'}},
          e: {diagram: 'a|', values: {a: 'e-0'}},
        },
        expected: {
          DOM: {
            outputs: vNodes,
            successMessage: 'sink DOM produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          user$: {
            outputs: [],
            successMessage: 'sink user produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          childrenSinks$: {
            outputs: [
              h('div', {}, [
                h('span', {style: {fontWeight: 'bold'}}, 'child1-a-0'),
              ]),
              h('div', {}, [
                h('span', {style: {fontWeight: 'italic'}}, 'child2-a-0'),
              ]),
              h('div', {}, [
                h('span', {style: {fontWeight: 'bold'}}, 'child1-a-1'),
              ]),
              h('div', {}, [
                h('span', {style: {fontWeight: 'italic'}}, 'child2-a-1'),
              ]),
            ],
            successMessage: 'sink childrenSinks produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          settings$: {
            outputs: [{}], // When there is no settings, it sets settings to {}
            successMessage: 'sink settings produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          auth$: {
            outputs: ["google", "auth-0"],
            successMessage: 'sink auth$ produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          a: {
            outputs: [
              "child1-a-b-0",
              "child2-a-d-0",
              "child1-a-b-1",
              "child1-a-b-2",
              "child2-a-d-2"
            ],
            successMessage: 'sink a produces the expected values',
            analyzeTestResults: analyzeTestResults,
          },
          c: {
            outputs: ["child1-c-c-0", "child1-c-c-1", "child1-c-c-2"],
            successMessage: 'sink c produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          d: {
            outputs: ["child2-e-e-0"],
            successMessage: 'sink d produces the expected values',
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
