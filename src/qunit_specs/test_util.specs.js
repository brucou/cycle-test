define(function (require) {
  const U = require('util')
  const Rx = require('rx')
  const $ = Rx.Observable
  const tutils = require('test_util')
  const runTestScenario = tutils.runTestScenario
  const runTestScenario2 = tutils.runTestScenario2

  QUnit.module("Testing runTestScenario helper", {});

  QUnit.skip("runTestScenario(testSources, testCase, testFn, settings) :" +
    " Main case",
    function exec_test(assert) {
      let done = assert.async(3)

      function analyzeTestResults(actual, expected, message) {
        assert.deepEqual(actual, expected, message)
        done()
      }

      const testSources = {
        a: new Rx.ReplaySubject(1),
        b: new Rx.ReplaySubject(1),
      }

      /** @type TestCase */
      const testCase = {
        inputs: {
          a: {diagram: 'xy|', values: {x: 'a-0', y: 'a-1'}},
          b: {diagram: 'xyz|', values: {x: 'b-0', y: 'b-1', z: 'b-2'}},
        },
        expected: {
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
      }

      const testFn = sources => ({
        m: $.merge(sources.a, sources.b).map((x => 'm-' + x)),
        n: sources.a.map(x => 'n-' + x),
        o: sources.b.delay(3).map(x => 'o-' + x)
      })

      runTestScenario(testSources, testCase, testFn, {
        timeUnit: 10,
        waitForFinishDelay: 30
      })
    })

  QUnit.test("runTestScenario2(inputs, testCase, testFn, settings) :" +
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

      /** @type TestCase */
        // TODO : change types, remove old runTestScenario, rename new
      const testCase = {
          expected: {
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
        }

      const testFn = sources => ({
        m: $.merge(sources.a, sources.b).map((x => 'm-' + x)),
        n: sources.a.map(x => 'n-' + x),
        o: sources.b.delay(3).map(x => 'o-' + x)
      })

      runTestScenario2(inputs, testCase, testFn, {
        tickDuration: 10,
        waitForFinishDelay: 30
      })
    })

})
