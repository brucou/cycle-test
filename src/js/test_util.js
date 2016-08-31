define(function (require) {
  const R = require('ramda')
  const U = require('util')
  const Rx = require('rx')
  const $ = Rx.Observable

  return require_test_utils(Rx, $, R, U)
})

/**
 * @typedef {function(*):boolean} Predicate
 */
/**
 * @typedef {Object} Input
 */
/**
 * @typedef {Object} Output
 */
/**
 * @typedef {{diagram: string, values: Object.<string, Input>}} Sequence
 */
/**
 * @typedef {Object} ExpectedRecord
 * @property {?function (outputs:Array<Output>)} transformFn
 * @property {Array<Output>} outputs
 * @property {?String} successMessage
 * @property {!function (Array<Output>, Array<Output>), String} analyzeTestResults
 */
/**
 * @typedef {Object} TestCase
 * @property {!Object.<string, Sequence>} inputs
 * @property {!Object.<string, ExpectedRecord>} expected
 */

function require_test_utils(Rx, $, R, U) {
  const makeSourceFromDiagram = U.makeSourceFromDiagram
  const identity = R.identity
  const mapObjIndexed = R.mapObjIndexed
  const valuesR = R.values
  const allR = R.all
  const reduceR = R.reduce
  const keysR = R.keys
  const rxlog = function (label) {return console.warn.bind(console, label)}
  const isOptSinks = U.isOptSinks

  const assertSignature = U.assertSignature
  const assertContract = U.assertContract

  //////
  // Contract and signature checking helpers
  function isTestCase(obj) {
    return obj.inputs && isSequence(obj.inputs)
      && obj.expected && isExpectedRecord(obj.expected)
  }

  function isSequence(obj) {
    var isSeq = true;
    mapObjIndexed((sequence, sourceName) => {
      isSeq = isSeq &&
        sequence.diagram && U.isString(sequence.diagram) &&
        (!sequence.values || U.isObject(sequence.values))
    }, obj)

    return isSeq
  }

  function isExpectedStruct(record) {
    return (!record.transformFn || U.isFunction(record.transformFn)) &&
      record.outputs && U.isArray(record.outputs) &&
      record.analyzeTestResults && U.isFunction(record.analyzeTestResults) &&
      (!record.successMessage || U.isString(record.successMessage))
  }

  function isExpectedRecord(obj) {
    return R.all(isExpectedStruct, valuesR(obj))
  }

  function hasTestCaseForEachSink(testCase, sinkNames) {
    return allR(sinkName => testCase.expected[sinkName], sinkNames)
  }

  //////
  // test execution helpers
  function makeTestSources(aSourceNames) {
    return reduceR((accTestSources, sourceName) => {
      accTestSources[sourceName] = new Rx.ReplaySubject(1)
      return accTestSources
    }, {}, aSourceNames)
  }

  function endOf(sourcesSimulation$) {
    return $.merge(valuesR(sourcesSimulation$)).last()
  }

  function sendTestInputsTo(testSources, settings) {
    const defaultTimeUnit = 1000
    const timeUnit = settings.timeUnit || defaultTimeUnit

    return function sendTestInputs(sequence, sourceName, obj) {
      let sourceSimulation$ = makeSourceFromDiagram(
        sequence.diagram,
        {values: sequence.values, timeUnit: timeUnit}
      )
        // shared as it will be subscribed several times
        // in different places
        .share()

      // wire the inputs of that source to the corresponding subject
      sourceSimulation$.subscribe(testSources[sourceName])

      return sourceSimulation$
    }
  }

  function getTestResultsOf(sourcesSimulation, testCase, settings) {
    const defaultWaitForFinishDelay = 50
    const waitForFinishDelay = settings.waitForFinishDelay
      || defaultWaitForFinishDelay
    const expected = testCase.expected

    return function getTestResults(sink$, sinkName) {
      if (U.isUndefined(sink$)) {
        console.warn('getTestResults: received an undefined sink ' + sinkName)
        return $.of([])
      }

      return sink$
        .scan(function buildResults(accumulatedResults, sinkValue) {
          const transformFn = expected[sinkName].transformFn || identity
          const transformedResult = transformFn(sinkValue)
          accumulatedResults.push(transformedResult);

          return accumulatedResults;
        }, [])
        .do(rxlog('Transformed results for sink ' + sinkName + ' :'))
        // Give it some time to process the inputs,
        // after the inputs have finished being emitted
        // That's arbitrary, keep it in mind that the testing helper
        // is not suitable for functions with large processing delay
        // between input and the corresponding output
        .sample(endOf(sourcesSimulation).delay(waitForFinishDelay))
        .take(1)
    }
  }

  function analyzeTestResultsCurried(analyzeTestResultsFn, expectedResults,
                                     successMessage) {
    return function (actual) {
      return analyzeTestResultsFn(actual, expectedResults, successMessage)
    }
  }

  function analyzeTestResults(testCase) {
    return function analyzeTestResults(sinkResults$, sinkName) {
      const expected = testCase.expected[sinkName]
      const expectedResults = expected.outputs
      const successMessage = expected.successMessage
      const analyzeTestResultsFn = expected.analyzeTestResults

      return sinkResults$
        // `analyzeTestResultsFn` should include `assert` which
        // throw if the test fails
        .tap(analyzeTestResultsCurried(
          analyzeTestResultsFn, expectedResults, successMessage
        )
      )
    }
  }

  //////
  // Main functions

  /**
   * Tests a function against sources' test input values and the expected
   * values defined in a test case object.
   * The function to test is executed, and its sinks collected. When there are
   * no more inputs to send through the sources, output from each sink are
   * collected in an array, then passed through a transform function.
   * That transform function can be used to remove fields, which are irrelevant
   * or non-reproducible (for instance timestamps), before comparison.
   * Actual outputs for each sink are compared against expected outputs,
   * by means of a `analyzeTestResults` function.
   * That function can throw in case of failed assertion.
   *
   * @param {Object.<string, Subject>} testSources hash of sources,
   * matching a source name with a subject (usually a `replaySubject(1)`
   * to reproduce cycle behaviour).
   * @param {TestCase} testCase Object which contains all the relevant data
   * relevant to the test case : expected outputs, test message,
   * comparison function, output transformation, etc.
   * @param {function(Sources):Sinks} testFn Function to test
   * @param {{timeUnit: Number, waitForFinishDelay: Number}} settings
   * @throws
   */
  function runTestScenario(testSources, testCase, testFn, settings) {
    assertSignature('runTestScenario', arguments, [
      {testSources: U.isObject},
      {testCase: isTestCase},
      {testFn: U.isFunction},
      {settings: U.isNullableObject},
    ])

    // Set default values if any
    settings = settings || {}

    // Get a hash of input producers matching the hash of sources
    // In the process, we have started the producers of the test inputs
    // as defined in the marble diagrams,by subscribing them each to their
    // corresponding source subject
    // To err on the side of safety, a replaySubject(1) source is preferred
    // though it should not be most of the time necessary,
    // as for most `testFn`, the sinks will be wired on that same tick
    // This has to be carefully checked when switching to `most` as
    // its default behavior is to emit the first value on the next tick
    /** @type {Object.<string, Observable<Input>>} */
    const sourcesSimulation = mapObjIndexed(
      sendTestInputsTo(testSources, settings),
      testCase.inputs
    )

    // execute the function to be tested (for example a cycle component)
    let testSinks = testFn(testSources)
    if (!isOptSinks(testSinks)) {
      throw 'encountered a sink which is not an observable!'
    }

    /** @type {Object.<string, Observable<Array<Output>>>} */
    const sinksResults = mapObjIndexed(
      getTestResultsOf(sourcesSimulation, testCase, settings),
      testSinks
    )

    assertContract(hasTestCaseForEachSink, [testCase, keysR(sinksResults)],
      'runTestScenario : in testCase, could not find test inputs for all sinks!'
    )

    // Side-effect : execute `analyzeTestResults` function which
    // makes use of `assert` and can lead to program interruption
    /** @type {Object.<string, Observable<Array<Output>>>} */
    const resultAnalysis = mapObjIndexed(
      analyzeTestResults(testCase),
      sinksResults
    )

    // This takes care of actually starting the producers
    // which generate the execution of the test assertions
    $.merge(valuesR(resultAnalysis))
      .subscribe(
      rxlog('Test completed for sink:'),
      rxlog('An error occurred while executing test!'),
      rxlog('Tests completed!')
    )
  }

  return {
    runTestScenario: runTestScenario,
    makeTestSources: makeTestSources
  }
}
