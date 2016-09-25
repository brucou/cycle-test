/**
 * Test plan
 *
 * A. Testing strategy
 * Main case tests must cover HaveParent x Signature x Children
 * That makes for 2 x 2 x 3 potential tests:
 * - HaveParent : whether the component is used under a parent or at top level
 * - Signature : whether Signature 1 or 2
 * - Children : whether the component has no children, 1 child, or several
 * children (We assume here that if the tests pass for two children, they will
 * pass for any number of children > 2)
 *
 * We will reduce the number of tests to perform to: 2 x 2 x (2x2 > 2 ?1 :2) by:
 * - skipping the tests with 1 child, by assuming furthermore that if the
 * tests for several children are passed, the tests for 1 child is passed.
 * - assuming that the behaviour linked to the children argument is
 * independent of the behaviour linked to the other arguments. Hence that
 * behaviour can be tested 'for free' on the way to testing expected
 * behaviour under the rest of the arguments.
 *
 * We hence remain with 4 tests to perform:
 * - (No parent, Parent) x (signature1, signature2)
 * which will include along the way:
 * - (no children, 2 children)
 * - (default for optional properties, configured optional properties)
 *
 * B. Test scenarii
 * TODO : Detail the 2 x 2
 */

// TODO : documentation : Note that the switch does not incorporate a
// distinctUntilChanged logic, i.e. transitions f -> f are real (just f in
// the case of routing)
// So the switching logic is for each incoming value of switch source
// matching the component case, activate this component. Even if component was
// already activated because of the previous value of switch source, it is
// still reactivated.
// Should ponder over whether that is a desirable logic or not
// For authentification, auth values should not repeat themselves (or they
// do if you authentificate twice???) Interesting edge case

define(function (require) {
  const U = require('util')
  const R = require('ramda');
  const Rx = require('rx')
  const Switch = require('components/Switch')
  const Sdom = require('cycle-snabbdom')
  const Sdom2html = require('snabbdom-to-html').toHTML
  const tutils = require('test_util')

  const $ = Rx.Observable
  const {h, div, span} = Sdom
  const runTestScenario = tutils.runTestScenario
  const m = U.m

  QUnit.module("Testing Switch component", {})

  QUnit.skip("main cases - no parent - no children - switch on source", function exec_test(assert) {

        const mComponent = m(Switch,
            {
              on: 'switch$',
              sinkNames: ['DOM', 'a', 'b'],
              caseWhen: true
            },
            [])

        const inputs = [
          {DOM1: {diagram: '-a--b--c--d--e--f--a'}},
          {DOM2: {diagram: '-a-b-c-d-e-f-abb-c-d'}},]

        /** @type TestResults */
        const expected = {
          DOM: {
            outputs: [],
            successMessage: 'sink DOM produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          a: {
            outputs: [],
            successMessage: 'sink a produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          b: {
            outputs: [],
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

        assert.throws(function () {
          runTestScenario(inputs, expected, testFn, {
            tickDuration: 5,
            waitForFinishDelay: 30
          })
        }, /contract/, 'Throws if the switch combinator is called with no' +
            ' child component to switch to')
      }
  )

  QUnit.skip("main cases - no parent - 2 children - switch on source", function exec_test(assert) {
    let done = assert.async(3)

    const childComponent1 = function childComponent1(sources, settings) {
      return {
        DOM: sources.DOM1.take(4)
            .tap(console.warn.bind(console, 'DOM : component 1: '))
            .map(x => h('span', {}, `Component 1 : ${x}`))
            .concat($.never()),
        a: sources.userAction$.map(x => `Component1 - user action : ${x}`)
      }
    }
    const childComponent2 = function childComponent1(sources, settings) {
      return {
        DOM: sources.DOM2.take(4)
            .tap(console.warn.bind(console, 'DOM : component 2: '))
            .map(x => h('span', {}, `Component 2 : ${x}`))
            .concat($.never()),
        b: sources.userAction$.map(x => `Component2 - user action : ${x}`)
      }
    }

    const mComponent = m(Switch,
        {
          on: 'switch$',
          sinkNames: ['DOM', 'a', 'b'],
          caseWhen: true
        },
        [childComponent1, childComponent2])

    const inputs = [
      {DOM1: {diagram: '-a--b--c--d--e--f--a'}},
      {DOM2: {diagram: '-a-b-c-d-e-f-abb-c-d'}},
      {
        userAction$: {
          diagram: 'abc-b-ac--ab---c',
          values: {a: 'click', b: 'select', c: 'hover',}
        }
      },
      {
        switch$: {
          //diagr: '-a--b--c--d--e--f--a',
          //diagr: '-a-b-c-d-e-f-abb-c-d',
          //userA: 'abc-b-ac--ab---c',
          diagram: '-t-f-tttttff-t', values: {
            t: true,
            f: false,
          }
        }
      }
    ]

    function makeVNode(x, y) {
      return div([
        h('span', {}, `Component 1 : ${x}`),
        h('span', {}, `Component 2 : ${y}`),
      ])
    }

    const vNodes = [
      null, //t. -> starts with null
      null, // transition t -> f
      null, //t. -> starts with null
      null, //t. -> starts with null
      makeVNode('c', 'd'),
      null, //t. -> starts with null
      null, //t. -> starts with null
      null, //t. -> starts with null
      null, // transition t -> f
      // transition f -> f // Is that good??? Yes it is filtered in
      // utils.mergeChildrenIntoParentDOM
      null,
      null, //t. -> starts with null
      //      makeVNode('c','e'), // won't happen because combineLatest
      // (a,b) needs a first value for both a and b to emits its first value
      //      makeVNode('d','e'),
      makeVNode('f', 'b'),
      makeVNode('f', 'c'),
      makeVNode('a', 'c'),
      makeVNode('a', 'd'),
    ]

    /** @type TestResults */
    const expected = {
      DOM: {
        outputs: vNodes,
        successMessage: 'sink DOM produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      a: {
        outputs: [
          'Component1 - user action : hover',
          'Component1 - user action : click',
          'Component1 - user action : hover',
          'Component1 - user action : click',
          'Component1 - user action : hover',
        ],
        successMessage: 'sink a produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      b: {
        outputs: [
          'Component2 - user action : hover',
          'Component2 - user action : click',
          'Component2 - user action : hover',
          'Component2 - user action : click',
          'Component2 - user action : hover',
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
      tickDuration: 5,
      waitForFinishDelay: 30
    })

  })

  QUnit.test("main cases - parent - 2 children - switch on condition", function exec_test(assert) {
    let done = assert.async(3)

    const childComponent1 = function childComponent1(sources, settings) {
      return {
        DOM: sources.DOM1.take(4)
            .tap(console.warn.bind(console, 'DOM : component 1: '))
            .map(x => h('span', {}, `Component 1 : ${x}`))
            .concat($.never()),
        a: sources.userAction$.map(x => `Component1 - user action : ${x}`)
      }
    }
    const childComponent2 = function childComponent1(sources, settings) {
      return {
        DOM: sources.DOM2.take(4)
            .tap(console.warn.bind(console, 'DOM : component 2: '))
            .map(x => h('span', {}, `Component 2 : ${x}`))
            .concat($.never()),
        b: sources.userAction$.map(x => `Component2 - user action : ${x}`)
      }
    }
    const childComponent3 = function childComponent1(sources, settings) {
      return {
        DOM: sources.DOM2.take(4)
            .tap(console.warn.bind(console, 'DOM : component 3: '))
            .map(x => h('span', {}, `Component 3 : ${x}`))
            .concat($.never()),
        b: sources.userAction$.map(x => `Component3 - user action : ${x}`)
      }
    }

    // TODO put a parent here
    const mComponent = m({mergeSinks: (ownSinks, childrenSinks) => {
      return // TODO : I should pass the childrenSinks in the form
      // {sinkName: [ProjectedChildrenSinks]}, and same form for the parent
      // and update the tests
      // TODO : add a utility function which adds the parent on top of the
      // children
      // TODO : for switch try with a normal merge for all sinkNames
      // but If I do a merge normal on DOM, I don't need to start with null
      // anymore??, YES I DO : be aware that the merge is only at top level,
      // the lower level (case) is with combineLatest on the children
      // NO : try with normal merge and no null !!
    }}, {}, [
      m(Switch, {
        index: 0,
        on: 'sweatch$',
        sinkNames: ['DOM', 'a', 'b'],
        caseWhen: true
      }, [childComponent1, childComponent2]),
      m(Switch, {
        index: 0,
        on: 'sweatch$',
        sinkNames: ['DOM', 'a', 'b'],
        caseWhen: false
      }, [childComponent3])
    ])

    const inputs = [
      {DOM1: {diagram: '-a--b--c--d--e--f--a'}},
      {DOM2: {diagram: '-a-b-c-d-e-f-abb-c-d'}},
      {
        userAction$: {
          diagram: 'abc-b-ac--ab---c',
          values: {a: 'click', b: 'select', c: 'hover',}
        }
      },
      {
        'sweatch$': {
          //diagr: '-a--b--c--d--e--f--a',
          //diagr: '-a-b-c-d-e-f-abb-c-d',
          //userA: 'abc-b-ac--ab---c',
          diagram: '-t-f-tttttff-t', values: {
            t: true,
            f: false,
          }
        }
      }
    ]

    function makeVNode(x, y, z) {
      return !z ?
          div([
            h('span', {}, `Component 1 : ${x}`),
            h('span', {}, `Component 2 : ${y}`),
          ]) :
          div([
            h('span', {}, `Component 3 : ${z}`)
          ])
    }

    const vNodes = [
      makeVNode('', '', 'c'),
      makeVNode('c', 'd'),
      //      makeVNode('c','e'), // won't happen because combineLatest
      // (a,b) needs a first value for both a and b to emits its first value
      //      makeVNode('d','e'),
      makeVNode('f', 'b'),
      makeVNode('', '', 'f'),
      makeVNode('', '', 'a'),
      makeVNode('f', 'c'),
      makeVNode('a', 'c'),
      makeVNode('a', 'd'),
    ]

    /** @type TestResults */
    const expected = {
      DOM: {
        outputs: vNodes,
        successMessage: 'sink DOM produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      a: {
        outputs: [
          'Component1 - user action : hover',
          'Component1 - user action : click',
          'Component1 - user action : hover',
          'Component1 - user action : click',
          'Component1 - user action : hover',
        ],
        successMessage: 'sink a produces the expected values',
        analyzeTestResults: analyzeTestResults,
        transformFn: undefined,
      },
      b: {
        outputs: [
          // basically all userAction after first value of switch$ is emitted
          "Component2 - user action : hover",
          "Component3 - user action : select",
          "Component2 - user action : click",
          "Component2 - user action : hover",
          "Component2 - user action : click",
          "Component3 - user action : select",
          "Component2 - user action : hover"
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
      tickDuration: 5,
      waitForFinishDelay: 30
    })

  })

  QUnit.skip("main cases - parent - no children - switch on condition", function exec_test(assert) {
  })

})
