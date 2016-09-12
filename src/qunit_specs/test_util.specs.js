define(function (require) {
  const U = require('util')
  const Rx = require('rx')
  const $ = Rx.Observable
  const tutils = require('test_util')
  const runTestScenario = tutils.runTestScenario

  QUnit.module("Testing runTestScenario helper", {});

  QUnit.test("runTestScenario(testSources, testCase, testFn, settings) :" +
    " Main case",
    function exec_test(assert) {
      let done = assert.async(3)

      function analyzeTestResults(actual, expected, message) {
        assert.deepEqual(actual, expected, message)
        done()
      }

      const inputs = [
        {a: {diagram: 'xy|', values: {x: 'a-0', y: 'a-1'}}},
        {b: {diagram: 'xyz|', values: {x: 'b-0', y: 'b-1', z: 'b-2'}}}
      ]

      /** @type TestResults */
      const testCase = {
        m: {
          outputs: ['m-a-0', 'm-b-0', 'm-a-1', 'm-b-1', 'm-b-2'],
          successMessage: 'sink m produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: undefined,
        },
        n: {
          outputs: ['t-n-a-0', 't-n-a-1'],
          successMessage: 'sink n produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: x => 't-' + x,
        },
        o: {
          outputs: ['o-b-0', 'o-b-1', 'o-b-2'],
          successMessage: 'sink o produces the expected values',
          analyzeTestResults: analyzeTestResults,
          transformFn: undefined,
        }
      }

      const testFn = sources => ({
        m: $.merge(sources.a, sources.b).map((x => 'm-' + x)),
        n: sources.a.map(x => 'n-' + x),
        o: sources.b.delay(3).map(x => 'o-' + x)
      })

      runTestScenario(inputs, testCase, testFn, {
        timeUnit: 10,
        waitForFinishDelay: 30
      })
    })

  QUnit.test("runTestScenario(inputs, testCase, testFn, settings) :" +
    " Main case",
    function exec_test(assert) {
      let done = assert.async(3)

      function analyzeTestResults(actual, expected, message) {
        assert.deepEqual(actual, expected, message)
        done()
      }

      const inputs = [
        {a: {diagram: 'xy|', values: {x: 'a-0', y: 'a-1'}}},
        {b: {diagram: 'xyz|', values: {x: 'b-0', y: 'b-1', z: 'b-2'}}},
      ]

      /** @type TestResults */
        // TODO : change types, remove old runTestScenario, rename new
      const expected = {
          m: {
            outputs: ['m-a-0', 'm-b-0', 'm-a-1', 'm-b-1', 'm-b-2'],
            successMessage: 'sink m produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          },
          n: {
            outputs: ['t-n-a-0', 't-n-a-1'],
            successMessage: 'sink n produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: x => 't-' + x,
          },
          o: {
            outputs: ['o-b-0', 'o-b-1', 'o-b-2'],
            successMessage: 'sink o produces the expected values',
            analyzeTestResults: analyzeTestResults,
            transformFn: undefined,
          }
        }


      const testFn = sources => ({
        m: $.merge(sources.a, sources.b).map((x => 'm-' + x)),
        n: sources.a.map(x => 'n-' + x),
        o: sources.b.delay(3).map(x => 'o-' + x)
      })

      runTestScenario(inputs, expected, testFn, {
        tickDuration: 10,
        waitForFinishDelay: 30
      })
    })

})
