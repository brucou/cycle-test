// SwitchSettings :: SwitchOnCondition | SwitchOnSource
// SwitchOnCondition :: Record {Sources -> Settings -> Source, CaseWShen, Opt
// eqFn}
// SwitchOnSource :: Record {SourceName, CaseWhen, Opt CompareFn}
//
// mSwitch :: SwitchSettings -> [Component] -> Component
// Be careful that the inheritance of settings down the chain can pollute
//  children... So I need to check the presence of the passed settings before
// merge to check that mandatory properties are passed and not inherited
// unexpectedly from an ancestor
// TODO : typings to add

/**
 * Test plan
 *
 * A. Testing strategy
 * Tests must cover HaveParent x Signature x Children
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
 * - including (no children, 2 children) in those 4 tests
 *
 * B. Test scenarii
 * TODO : Detail the 2 x 2
 */

define(function (require) {
  const U = require('util')
  const R = require('ramda')
  const Rx = require('rx')
  const $ = Rx.Observable
  const Sdom = require('cycle-snabbdom')

  // TODO : to put all config properties in one file??
  // CONFIG
  const DEFAULT_SWITCH_COMPONENT_SOURCE_NAME = 'switch$'
  const defaultEqFn = function swichCptdefaultEqFn(a, b) {
    return a === b
  }
  const cfg = {
    defaultSwitchComponentSourceName: DEFAULT_SWITCH_COMPONENT_SOURCE_NAME,
    defaultEqFn: defaultEqFn
  }

  return require_switch_component(Rx, $, U, R, Sdom, cfg)
})

function require_switch_component(Rx, $, U, R, Sdom, cfg) {
  const {h, div, span} = Sdom
  const {assertSignature, isString, isArray, isFunction, defaultsTo, m} = U
  const {
      map, mapObjIndexed, merge, mergeAll, values, either, flatten, all,
      keys, reduce, always, reject, isNil, uniq, omit, path, complement,
      prepend
  } = R
  const mapIndexed = R.addIndex(R.map)

  /**
   * The switch combinator activates a component conditionally depending on
   * whether a condition is satisfied. Note that the condition is evaluated
   * every time there is an incoming value on the relevant sources. If it is
   * necessary to implement a logic by which, the component activation
   * should only trigger on **changes** of the incoming value, that logic
   * can be implemented by using the appropriate combinator signature.
   * When the condition is no longer satisfied, the previously activated
   * component is deactivated automatically :
   * - DOM sink emits null and terminates
   * - Non-DOM sinks are empty
   * The exception in treatment for the DOM sink is to enable the component to
   * work well under a parent which merges its children sinks with a
   * `combineLatest`-like operator. As this operator emits value only when
   * every one of its sources have emitted at least one value, we have to emit
   * a value for each child to avoid blocking unduly the parent DOM merging.
   *
   * Signature 1: SwitchOnCondition -> [Component] -> Component
   * - settings.on :: Sources -> Settings -> Source
   * The function passed as parameter is returning a source observable whose
   * values will be used for the conditional switching. Logi
   * - settings.sinkNames :: [SinkName]
   * This is an array with the names of the sinks to be constructed. This is
   * mandatory as we can't know in advance which sinks to produce
   * - settings.caseWhen :: *
   * An object which will activate the switch whenever the source observable
   * returned by the `on` parameter emits that object
   * - settings.eqFn :: * -> * -> Boolean
   * A predicate which returns true if both parameters are considered equal.
   * This parameter defaults to `===`
   *
   * Signature 2: SwitchOnSource -> [Component] -> Component
   * - settings.on :: SourceName
   * A string which is the source name whose values will be used for the
   * conditional activation of the component. The sources used will be
   * sources[sourceName]
   * - Cf. Signature 1 for the meaning of the rest of parameters
   *
   */
  function makeAllSinks(sources, settings, childrenComponents) {
    // TODO : write the program for 1-5
    // 1. Assert and determine the type of signature
    // 2. Get the arguments
    // 3. Check settings and sources contracts with the passed arguments,
    // i.e. before merging. This is done to prevent pollution from
    // properties inherited from parent
    // source contracts :
    // - if signature 2, sources[sourceName] must be an observable
    // - if signature 1, the return value of the function must be an observable
    // settings contracts :
    // mandatory : on, caseWhen (type to check depending on signature detected)
    //
    // 4. set default values for optional arguments
    // eqFn is === if not present
    // 5. Harmonize the signature (the signature 2 -> signature by  setting
    // the relevant function)
    // -> guard$, eqFn, caseWhen, sinkNames

    // debug info
    console.groupCollapsed('Switch component > makeAllSinks')
    console.debug('sources, settings, childrenComponents', sources, settings, childrenComponents);

    // TODO : analyze whether merge inner settings etc. into the
    // settings passed in AllSinks...

    assertContract(isSwitchSettings, [sources, settings], 'Invalid switch' +
        ' settings!')
//TODO : isSwitchSettings and go to bed
    let {eqFn, caseWhen, sinkNames, on} = settings

    let guard$, sourceName
    if (isFunction(on)) {
      guard$ = on
    } else {
      sourceName = on
    }
    // TODO: make a util function similar to unfoldOverload

    // set default values for optional properties
    sourceName = defaultsTo(sourceName, cfg.defaultSwitchComponentSourceName)
    eqFn = defaultsTo(eqFn, cfg.defaultEqFn)
    guard$ = defaultsTo(guard$, sources => sources[sourceName])


    const shouldSwitch$ = guard$
        .map(x => eqFn(caseWhen, x))
        .filter(x => x)

    const cachedSinks$ = shouldSwitch$
        .map(function (_) {
          const mergedChildrenComponentsSinks = m(
              {},
              {matched: caseWhen},
              childrenComponents)
          return mergedChildrenComponentsSinks(sources, settings)
        })
        .share() // multicasted to all sinks

    function makeSwitchedSinkFromCache(sinkName) {
      return function makeSwitchedSinkFromCache(_, cachedSinks) {
        var cached$, preCached$, prefix$

        // Case : matches configured value
        if (cachedSinks[sinkName] != null) {
          // Case : the component produces a sink with that name
          // This is an important case, as parent can have children
          // nested at arbitrary levels, with either :
          // 1. sinks which will not be retained (not in `sinkNames`
          // settings)
          // 2. or no sinks matching a particular `sinkNames`
          // Casuistic 1. is taken care of automatically as we only
          // construct the sinks in `sinkNames`
          // Casuistic 2. is taken care of thereafter

          prefix$ = sinkName === 'DOM' ?
              // Case : DOM sink
              // actually any sink which is merged with a `combineLatest`
              // but here by default only DOM sinks are merged that way
              // Because the `combineLatest` blocks till all its sources
              // have started, and that behaviour interacts badly with
              // route changes desired behavior, we forcibly emits a `null`
              // value at the beginning of every sink.
              $.of(null) :
              // Case : Non-DOM sink
              // Non-DOM sinks are merged with a simple `merge`, there
              // is no conflict here, so we just return nothing
              $.empty()

          preCached$ = cachedSinks[sinkName]
              .tap(console.log.bind(console, 'sink ' + sinkName + ':'))
              .finally(_ => {
                console.log(`sink ${sinkName} terminating due to route change`)
              })

          cached$ = $.concat(prefix$, preCached$)
          // TODO : DRY refactor not to repeat what is already in the router
        }
        else {
          // Case : the component does not have any sinks with the
          // corresponding sinkName
          cached$ = $.empty()
        }

        return cached$
      }
    }

    function makeSwitchedSink(sinkName) {
      return {
        [sinkName]: shouldSwitch$.withLatestFrom(
            cachedSinks$,
            makeSwitchedSinkFromCache(sinkName)
        ).switch()
      }
    }

    return mergeAll(map(makeSwitchedSink, sinkNames))
  }

  return {
    makeAllSinks: makeAllSinks
  }
}
