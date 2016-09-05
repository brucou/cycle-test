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
 * @typedef {Object} TestResults
 * @property {!Object.<string, Sequence>} inputs
 * @property {!Object.<string, ExpectedRecord>} expected
 */

function require_test_utils(Rx, $, R, U) {
  const makeSourceFromDiagram = U.makeSourceFromDiagram
  const identity = R.identity
  const mapObjIndexed = R.mapObjIndexed
  const mapIndexed = R.addIndex(R.map)
  const valuesR = R.values
  const allR = R.all
  const reduceR = R.reduce
  const keysR = R.keys
  const mapR = R.map
  const always = R.always
  const rxlog = function (label) {return console.warn.bind(console, label)}
  const isOptSinks = U.isOptSinks

  const assertSignature = U.assertSignature
  const assertContract = U.assertContract

  const tickDurationDefault = 5

  //////
  // Contract and signature checking helpers
  function isSourceInput(obj) {
    return obj && keysR(obj).length === 1
      && U.isString(valuesR(obj)[0].diagram)
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
    return allR(sinkName => testCase[sinkName], sinkNames)
  }

  //////
  // test execution helpers
  function makeTestSources(aSourceNames) {
    return reduceR((accTestSources, sourceName) => {
      accTestSources[sourceName] = new Rx.Subject()
      // TODO : change the factory method : could perfectly be replay or not
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
        //        .do(rxlog('Transformed results for sink ' + sinkName + ' :'))
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

  function analyzeTestResults(testExpectedOutputs) {
    return function analyzeTestResults(sinkResults$, sinkName) {
      const expected = testExpectedOutputs[sinkName]
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

  function getTestResults(testInputs$, expected, settings) {
    const defaultWaitForFinishDelay = 50
    const waitForFinishDelay = settings.waitForFinishDelay
      || defaultWaitForFinishDelay

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
        //        .do(rxlog('Transformed results for sink ' + sinkName + ' :'))
        // Give it some time to process the inputs,
        // after the inputs have finished being emitted
        // That's arbitrary, keep it in mind that the testing helper
        // is not suitable for functions with large processing delay
        // between input and the corresponding output
        .sample(testInputs$.last().delay(waitForFinishDelay))
        .take(1)
    }
  }

  /**
   * @typedef {{diagram: string, values:*}} Input
   * only one key,value pair though
   */
  /**
   * @typedef {Object.<string, Input>} SourceInput
   * only one key,value pair though
   */

  /**
   *
   * @param {Number} tickNum
   * @param {Array<SourceInput>} inputs
   * @returns {Array<SourceInput>} a similar array of input but with a
   * diagram with only one character taken from the input diagram at
   * position tickNum
   */
  function projectAtIndex(tickNum, inputs) {
    return mapR(function mapInputs(sourceInput) {
      return mapR(function projectDiagramAtIndex(input) {
        return {
          diagram: input.diagram[tickNum],
          values: input.values
        }
      }, sourceInput)
    }, inputs)
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
   * @param {Array<SourceInput>} inputs
   * @param {TestResults} expected Object which contains all the relevant data
   * relevant to the test case : expected outputs, test message,
   * comparison function, output transformation, etc.
   * @param {function(Sources):Sinks} testFn Function to test
   * @param {{timeUnit: Number, waitForFinishDelay: Number}} settings
   * @throws
   */
  function runTestScenario(inputs, expected, testFn, settings) {
    assertSignature('_runTestScenario', arguments, [
      {inputs: U.isArrayOf(isSourceInput)},
      {testCase: isExpectedRecord},
      {testFn: U.isFunction},
      {settings: U.isNullableObject},
    ])

    // Set default values if any
    settings = settings || {}

    const tickDuration = settings.tickDuration ?
      settings.tickDuration :
      tickDurationDefault

    /** @type {Object.<string, observable>} */
      // Create the subjects which will receive the input data
      // There is a standard subject for each source declared in `inputs`
    let sourcesSubjects = reduceR(function makeSubjects(accSubjects, input) {
        accSubjects[keysR(input)[0]] = new Rx.Subject()
        return accSubjects
      }, {}, inputs)

    // Maximum length of input diagram strings
    // Ex:
    // a : '--x-x--'
    // b : '-x-x-'
    // -> maxLen = 7
    const maxLen = Math.max.apply(null,
      mapR(sourceInput => valuesR(sourceInput)[0].diagram.length, inputs)
    )

    /** @type {Array<Number>} */
      // Make an index array [0..maxLen] for iteration purposes
    const indexRange = mapIndexed((input, index) => index, new Array(maxLen))

    /** @type Observable<Null>*/
      // Make a single chained observable which :
      // - waits some delay before starting to emit
      // - then for n in [0..maxLen]
      //   - emits the m values in position n in the input diagram, in `inputs`
      // array order, `m` being the number of input sources
      // wait for that emission to finish before nexting (`concat`)
      // That way we ENSURE that :
      // -a--
      // -b--     if a and b are in the same vertical (emission time), they
      // will always be emitted in the same order in every execution of the
      // test scenario
      // -a-
      // b--      values that are chronologically further in the diagram will
      // always be emitted later
      // This allows to have predictable and consistent data when analyzing
      // test results. That was not the case when using the `setTimeOut`
      // scheduler to handle delays.
    const testInputs$ = reduceR(function makeInputs$(accEmitInputs$, tickNo) {
        return accEmitInputs$
          .delay(tickDuration)
          .concat(
            $.from(projectAtIndex(tickNo, inputs))
              .do(function emitInputs(sourceInput) {
                // input :: {sourceName : {{diagram : char, values: Array<*>}}
                const sourceName = keysR(sourceInput)[0]
                const input = sourceInput[sourceName]
                const c = input.diagram
                const values = input.values || {}
                const sourceSubject = sourcesSubjects[sourceName]
                const errorVal = (values && values['#']) || '#'

                if (c) {
                  // case when the diagram for that particular source is
                  // finished but other sources might still go on
                  // In any case, there is nothing to emit
                  switch (c) {
                    case '-':
                      console.log('- doing nothing')
                      break;
                    case '#':
                      sourceSubject.onError({data: errorVal})
                      break;
                    case '|':
                      sourceSubject.onCompleted()
                      break;
                    default:
                      const val = values.hasOwnProperty(c) ? values[c] : c;
                      console.log('emitting for source ' + sourceName + ' ' + val)
                      sourceSubject.onNext(val)
                      break;
                  }
                }
              })
          )
      }, $.empty(), indexRange)
        .share()

    // execute the function to be tested (for example a cycle component)
    // with the source subjects
    let testSinks = testFn(sourcesSubjects)
    if (!isOptSinks(testSinks)) {
      throw 'encountered a sink which is not an observable!'
    }

    /** @type {Object.<string, Observable<Array<Output>>>} */
      // Gather the results in an array for easier processing
    const sinksResults = mapObjIndexed(
      getTestResults(testInputs$, expected, settings),
      testSinks
      )

    assertContract(hasTestCaseForEachSink, [expected, keysR(sinksResults)],
      '_runTestScenario : in testCase, could not find test inputs for all sinks!'
    )

    // Side-effect : execute `analyzeTestResults` function which
    // makes use of `assert` and can lead to program interruption
    /** @type {Object.<string, Observable<Array<Output>>>} */
    const resultAnalysis = mapObjIndexed(
      analyzeTestResults(expected),
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
    testInputs$.subscribe(
      function(){},
      rxlog('An error occurred while emitting test inputs'),
      rxlog('test inputs emitted')
    )
  }

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
   * @param {TestResults} testCase Object which contains all the relevant data
   * relevant to the test case : expected outputs, test message,
   * comparison function, output transformation, etc.
   * @param {function(Sources):Sinks} testFn Function to test
   * @param {{timeUnit: Number, waitForFinishDelay: Number}} settings
   * @throws
   */
  function _runTestScenario(testSources, testCase, testFn, settings) {
    assertSignature('_runTestScenario', arguments, [
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
      '_runTestScenario : in testCase, could not find test inputs for all sinks!'
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
