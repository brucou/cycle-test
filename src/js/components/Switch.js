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
  const {
      assertSignature, assertContract, checkSignature, hasPassedSignatureCheck,
      isString, isArray, isArrayOf, isFunction, defaultsTo, isSource,
      unfoldObjOverload, m, removeNullsFromArray
  } = U
  const {
      forEach, all, any, map, mapObjIndexed, reduce, keys, values,
      merge, mergeAll, flatten, prepend, uniq, always, reject,
      either, isNil, omit, path, complement, or
  } = R
  const mapIndexed = R.addIndex(R.map)

  //////
  // Helper functions
  function isSwitchSettings(settings) {
    const {eqFn, caseWhen, sinkNames, on} = settings
    const signature = {
      eqFn: either(isNil, isFunction),
      caseWhen: complement(isNil),
      sinkNames: isArrayOf(isString),
      on: either(isString, isFunction)
    }
    const signatureErrorMessages = {
      eqFn: 'eqFn property, when not undefined, must be a function.',
      caseWhen: 'caseWhen property is mandatory.',
      sinkNames: 'sinkNames property must be an array of strings',
      on: '`on` property is mandatory and must be a string or a function.'
    }

    return checkSignature(settings, signature, signatureErrorMessages)
  }

  function hasAtLeastOneChildComponent(childrenComponents) {
    return childrenComponents &&
    isArray(childrenComponents) &&
    childrenComponents.length >= 1 ?
        true :
        ''

  }

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
   * Contracts:
   * 1. Must have at least 1 child component (can't be switching to nothingness)
   */
  function computeSinks(makeOwnSinks, childrenComponents, sources, settings) {
    // 3. Check settings and sources contracts with the passed arguments,
    // i.e. before merging. This is done to prevent pollution from
    // properties inherited from parent
    // - if signature 1, the return value of the function must be an observable
    // settings contracts :
    // mandatory : on, caseWhen (type to check depending on signature detected)

    // debug info
    console.groupCollapsed('Switch component > makeAllSinks')
    console.debug('sources, settings, childrenComponents', sources, settings, childrenComponents)

    // TODO : a switch has to be wrapped into a switcher:
    // TODO : merge function is merge, not combineLatest!!
    // a switxh MUST have only one branch true for any given switch value
    // API : Switch({on: source$|Predicate},[Case({when:value})])
    // but inside the Case component, merge is combineLatest as always

    // TODO : analyze whether merge inner settings etc. into the
    // settings passed in AllSinks...

    assertContract(isSwitchSettings, [settings], 'Invalid switch' +
        ' component settings!')
    assertContract(hasAtLeastOneChildComponent, [childrenComponents], 'switch combinator must at least have one child component to switch to!')

    let {eqFn, caseWhen, sinkNames, on} = settings

    const overload = unfoldObjOverload(on, [
      {'guard$': isFunction},
      {'sourceName': isString}
    ])
    let {guard$, sourceName, _index} = overload
    let switchSource

    if (overload._index === 1) {
      // Case : overload `settings.on :: SourceName`
      switchSource = sources[sourceName]
      assertContract(isSource, [switchSource],
          `An observable with name ${sourceName} could not be found in sources`)
    }
    if (overload._index === 0) {
      // Case : overload `settings.on :: SourceName`
      switchSource = guard$(sources, settings)
      assertContract(isSource, [switchSource],
          `The function used for conditional switching did not return an observable!`)
    }

    // set default values for optional properties
    eqFn = defaultsTo(eqFn, cfg.defaultEqFn)

    const shouldSwitch$ = switchSource
        .map(x => eqFn(caseWhen, x))
    // TODO : should I filter out the transition f->f??
    // TODO : mergeDOMSinks in that case should be a merge, not a combineLatest
    // as cases are/should be mutually exclusive

    const cachedSinks$ = shouldSwitch$
        .filter(x => x)
        .map(function (_) {
          const mergedChildrenComponentsSinks = m(
              {},
              {matched: caseWhen},
              childrenComponents)
          return mergedChildrenComponentsSinks(sources, settings)
        })
        .share() // multicasted to all sinks

    function makeSwitchedSinkFromCache(sinkName) {
      return function makeSwitchedSinkFromCache(isMatchingCase, cachedSinks) {
        var cached$, preCached$, prefix$
        if (isMatchingCase) {
          // Case : the switch source emits a value corresponding to the
          // configured case in the component

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
                // !! Don't start with null in case of switching IN, only
                // when OUT
                $.empty() : //$.of(null) : // $.empty():
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
        }
        else {
          // Case : the switch source emits a value NOT corresponding to the
          // configured case in the component
          console.log('isMatchingCase is null!!! no match for this component on' +
              ' this route!')
          cached$ = sinkName === 'DOM' ? $.of(null) : $.empty()
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

    console.groupEnd()

    return mergeAll(map(makeSwitchedSink, sinkNames))
  }

  const SwitchCase = {
    mergeSinks: {
      DOM: function mergeDomSwitchedSinks(ownSink, childrenDOMSink, settings) {
        const allSinks = flatten([ownSink, childrenDOMSink])
        const allDOMSinks = removeNullsFromArray(allSinks)

        // NOTE : zip rxjs does not accept only one argument...
        if (allDOMSinks.length === 1) {
          return allDOMSinks[0]
        }
        else {
          return $.zip(allDOMSinks) //!! passes an array
              .tap(console.warn.bind(console, 'Switch.specs' +
                  ' > mergeDomSwitchedSinks > zip'))
              // Most values will be null
              // All non-null values correspond to a match
              // In the degenerated case, all values will be null (no match
              // at all)
              .map(arrayVNode => {
                const _arrayVNode = removeEmptyVNodes(removeNullsFromArray(arrayVNode))
                assertContract(isArrayOf(isVNode), [_arrayVNode], 'DOM sources must' +
                    ' stream VNode objects! Got ' + _arrayVNode)

                switch (_arrayVNode.length) {
                  case 0 :
                    return null
                  case 1 :
                    return _arrayVNode[0]
                  default :
                    return div(_arrayVNode)
                }
              })
        }
      }
    }
  }

  return {
    computeSinks: computeSinks,
    SwitchCase: SwitchCase
  }
}
