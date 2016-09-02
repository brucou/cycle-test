define(function (require) {
  const R = require('ramda');
  const Rx = require('rx');
  const $ = Rx.Observable;
  const Sdom = require('cycle-snabbdom')

  return require_util(Rx, $, R, Sdom);
});

function require_util(Rx, $, R, Sdom) {
  const h = Sdom.h
  const div = Sdom.div
  const span = Sdom.span

  const mapR = R.map
  const mapAccum = R.mapAccum
  const mapObjIndexed = R.mapObjIndexed
  const mapIndexed = R.addIndex(R.map)
  const mergeR = R.merge
  const valuesR = R.values
  const eitherR = R.either
  const flatten = R.flatten
  const allR = R.all
  const forEach = R.forEach
  const keys = R.keys
  const reduceR = R.reduce
  const always = R.always
  const or = R.or
  const identity = R.identity
  const reject = R.reject
  const isNil = R.isNil
  const uniq = R.uniq

  /**
   * @typedef {Object.<string, Observable>} Sources
   */
  /**
   * @typedef {Object.<string, Observable>} Sinks
   * NOTE : this type def is not perfect as we allow sometimes null values
   */
  /**
   * @typedef {?Object.<string, ?Object>} Settings
   */
  /**
   * @typedef {Object} ComponentDef
   * @property {?function(Sources, Settings)} makeLocalSources
   * @property {?function(Settings)} makeLocalSettings
   * @property {?function(Sources, Settings)} makeOwnSinks
   * @property {function(Sinks, Sinks, Settings)} mergeSinks
   * @property {function(Sinks):Boolean} sinksContract
   */
  /**
   * @typedef {function(Sources, Settings):Sinks} Component
   */
  /**
   * Returns a component specified by :
   * - a component definition object (nullable)
   * - settings (nullable)
   * - children components
   * Component definition default properties :
   * - mergeAllSinks :
   *   - DOM : mergeDOMSinksDefault
   *   - non-DOM : mergeNonDOMSinksDefault
   * - sinksContract : check all sinks are observables or `null`
   * - makeLocalSources : -> null
   * - makeLocalSettings : -> null
   * - makeOwnSinks : -> null
   * That component computes its sinks from its sources by:
   * - merging current sources with extra sources if any
   * - creating some sinks by itself
   * - computing children sinks by executing the children components on the
   * merged sources
   * - merging its own computed sinks with the children computed sinks
   * @param {?ComponentDef} componentDef
   * @param {?Object} _settings
   * @param {Array<Component>} children
   * @returns {Component}
   * @throws when type- and user-specified contracts are not satisfied
   */
  // m :: Opt Component_Def -> Opt Settings -> [Component] -> Component
  function m(componentDef, _settings, children) {
    // check inputs against expected types
    const mSignature = [
      {componentDef: isNullableComponentDef},
      {settings: isNullableObject},
      {children: isArrayOf(isComponent)},
    ]

    assertSignature('m', arguments, mSignature)

    return function m(sources, innerSettings) {
      const settings = mergeR(_settings, innerSettings)
      const makeLocalSources = componentDef.makeLocalSources || always(null)
      const makeLocalSettings = componentDef.makeLocalSettings || always(null)
      const makeOwnSinks = componentDef.makeOwnSinks || always(null)
      const mergeSinks = componentDef.mergeSinks || mergeSinksDefault
      const sinksContract = componentDef.sinksContract || always(true)

      // Computes and MERGES the extra sources which will be passed
      // to the children and this component
      // Extra sources are derived from the `sources`
      // received as input, which remain untouched
      const extendedSources = shareAllSources(
        mergeR(sources, makeLocalSources(sources, settings))
      )
      // Note that per `mergeR` ramda spec. the second object's values
      // replace those from the first in case of key conflict
      const localSettings = mergeR(settings, makeLocalSettings(settings))

      const ownSinks = makeOwnSinks(extendedSources, localSettings)
      const childrenSinks = mapR(
        childComponent => childComponent(extendedSources, localSettings),
        children
      )
      assertContract(isOptSinks, [ownSinks], 'ownSinks must be a hash of observable sink')
      assertContract(isArrayOptSinks, [childrenSinks], 'ownSinks must be a hash of observable sink')

      // merge the sinks from children and one-s own...
      const reducedSinks = mergeSinks(ownSinks, childrenSinks, localSettings)
      assertContract(isOptSinks, [reducedSinks], 'mergeSinks must return a hash of observable sink')

      // ... and make sure that the result follow the relevant contracts when defined...
      assertContract(sinksContract, [reducedSinks], 'fails custom contract ' + sinksContract.name)

      const tracedSinks = trace(reducedSinks, settings)
      // ... and add tracing information(sinkPath, timestamp, sinkValue/sinkError) after each sink
      // TODO : specify trace/debug/error generation information
      // This would ensure that errors are automatically and systematically
      //       caught in the component where they occur, and not
      //       interrupting the application implementation-wise, it might be
      //       necessary to add a `currentPath` parameter somewhere which
      //       carries the current path down the tree
      // TODO: sinks should ALWAYS be shareReplay-ed(1) automatically
      //       a priori, if we have a sharedReplay stream, it is always possible to ignore the replayed value
      //       with `skip(1)`, which could be turned into a new operator `skipReplay()` for the sake of clarity of intent
      //       but it is not possible to get the last value of a stream if not sharedReplayed beforehand,
      //       unless $.combineLatest is used. So it is probably safer to always replay sinks
      // TODO : sources should ALWAYS be shared as we don't know how many children will read from it
      //        A source might have to be share-replayed (if it represents a behavior),
      //        in which case at `makeLocalSources` level, a replay instruction can be added.
      //        If possible detect first if the source is `sharedReplay` before
      //        adding `share()` to it. I can't think of a case where a source
      //        MUST NOT be shared. Top-level sources are subjects,
      //        hence they are hot streams by nature. Local sources are built
      //        from top-level sources, and they end up in the global sinks
      //        where the top-level sources are connected. When top-level
      //        sources are connected, the local sources also are. If they would
      //        be cold streams, this means they might loose incoming values
      //        before they are subscribed to. Can't think of a use case where
      //        that behavior is desirable.

      return tracedSinks
    }
  }

  // BRC utils
  /**
   * Throws an exception if the arguments parameter fails at least one
   * validation rule
   * Note that all arguments are mandatory, i.e. the function does not deal with
   * optional arguments
   * @param {String} fnName
   * @param {Array<*>} _arguments
   * @param {[Array<Object.<string, Predicate>>]} vRules Validation rules.
   *
   * Given f(x, y) =  x + y, with x both int, in the body of `f`, include
   * function f(x, y) {
   *   assertSignature ('f', arguments, [{x:isInteger},{y:isInteger}],
   *                  'one of the parameters is not an integer!')
   *   ...
   * }
   */
  function assertSignature(fnName, _arguments, vRules) {
    const argNames = flatten(mapR(keys, vRules))
    const ruleFns = flatten(mapR(function (vRule) {
      return valuesR(vRule)[0]
    }, vRules))
    console.warn('assertSignature: argNames', argNames)

    const args = mapIndexed(function (vRule, index) {
      return _arguments[index]
    }, vRules)

    const validatedArgs = mapIndexed((value, index) => {
      const ruleFn = ruleFns[index]
      return ruleFn(value)
    }, args)

    const hasFailed = reduceR((acc, value) => {
      return !value || acc
    }, false, validatedArgs)

    if (hasFailed) {
      const validationMessages = mapIndexed((value, index) => {
          return value ?
            '' :
            [fnName, ':', 'argument', argNames[index],
              'fails rule', vRules[index].name].join(' ')
        }, validatedArgs
      ).join('\n')
      const errorMessage = ['assertSignature:', validationMessages].join(' ')
      throw errorMessage
    }

    return !hasFailed
  }

  /**
   * Test against a predicate, and throws an exception if the predicate
   * is not satisfied
   * @param {function(*): boolean} contractFn Predicate that must be satisfy
   * @param {Array<*>} contractArgs
   * @param {String} errorMessage
   * @returns {boolean}
   * @throws
   */
  function assertContract(contractFn, contractArgs, errorMessage) {
    if (!contractFn.apply(null, contractArgs)) {
      throw 'assertContract : fails contract ' + contractFn.name +
      '\n' + errorMessage
    }
    return true
  }

  /**
   * Returns true iff the passed parameter is null or undefined OR a POJO
   * @param {Object} obj
   * @returns {boolean}
   */
  function isNullableObject(obj) {
    // Note that `==` is used instead of `===`
    // This allows to test for `undefined` and `null` at the same time
    return obj == null || typeof obj === 'object'
  }

  function isNullableComponentDef(obj) {
    // Note that `==` is used instead of `===`
    // This allows to test for `undefined` and `null` at the same time
    return obj == null || (
        (!obj.makeLocalSources || isFunction(obj.makeLocalSources)) &&
        (!obj.makeLocalSettings || isFunction(obj.makeLocalSettings)) &&
        (!obj.makeOwnSinks || isFunction(obj.makeOwnSinks)) &&
        (!obj.mergeSinks || isFunction(obj.mergeSinks)) &&
        (!obj.sinksContract || isFunction(obj.sinksContract))
      )
  }

  function isUndefined(obj) {
    return typeof obj === 'undefined'
  }

  function isFunction(obj) {
    return typeof(obj) == 'function'
  }

  function isObject(obj) {
    return typeof(obj) == 'object'
  }

  function isString(obj) {
    return typeof(obj) == 'string'
  }

  function isArray(obj) {
    return Array.isArray(obj)
  }

  /**
   * Returns a function which returns true if its parameter is an array,
   * and each element of the array satisfies a given predicate
   * @param {function(*):Boolean} predicateFn
   * @returns {function():Boolean}
   */
  function isArrayOf(predicateFn) {
    if (typeof predicateFn !== 'function') {
      console.error('isArrayOf: predicateFn is not a function!!')
      return always(false)
    }

    return function _isArrayOf(obj) {
      if (!Array.isArray(obj)) {
        return false
      }

      return allR(predicateFn, obj)
    }
  }

  /**
   * Returns true iff the parameter `obj` represents a component.
   * @param obj
   * @returns {boolean}
   */
  function isComponent(obj) {
    // Without a type system, we just test that it is a function
    return isFunction(obj)
  }

  function isObservable(obj) {
    // duck typing in the absence of a type system
    return isFunction(obj.subscribe)
  }

  function isOptSinks(obj) {
    // obj can be null
    return !obj || allR(eitherR(isUndefined, isObservable), valuesR(obj))
  }

  function isArrayOptSinks(arrSinks) {
    return mapR(isOptSinks, arrSinks)
  }

  /**
   * Takes a hash of sources, and returns a hash with the same keys.
   * Sources are mapped by keys to their shared version
   * Example :
   * {DOM: a, route: b} -> {DOM: a.share(), route:b.share()}
   * @param {Sources} sources
   */
  function shareAllSources(sources) {
    // TODO BRC
    return sources
  }

  /**
   * Adds `tap` logging/tracing information to all sinks
   * @param {Sinks} sinks
   * @param {Settings} settings Settings with which the parent component is
   * called
   * @returns {*}
   */
  function trace(sinks, settings) {
    // TODO BRC
    return sinks
  }

  function removeNullsFromArray(arr) {
    return reject(isNil, arr)
  }

  function cloneVNode(vNode) {
    let clone = {}
    mapR(x => clone[x] = vNode[x],
      ['sel', 'data', 'children', 'text', 'elm', 'key']
    )
    return clone
  }

  function mergeChildrenIntoParentDOM(parentDOMSink) {
    return function mergeChildrenIntoParentDOM(arrayVNode) {
      if (parentDOMSink) {
        // Case : the parent sinks have a DOM sink
        let parentVNode = cloneVNode(arrayVNode.shift())
        let childrenVNode = arrayVNode
        parentVNode.children = parentVNode.children || []
        // Add the children vNodes produced by the children sinks
        // after the existing children produced by the parent sink
        Array.prototype.push.apply(parentVNode.children, childrenVNode)

        return parentVNode
      }
      else {
        // Case : the parent sinks does not have a DOM sink
        return div(arrayVNode)
      }
    }
  }

  /**
   * For each element object of the array, returns the indicated property of
   * that object, if it exists, null otherwise.
   * For instance, `projectSinksOn('a', obj)` with obj :
   * - [{a: ..., b: ...}, {b:...}]
   * - result : [..., null]
   * @param {String} prop
   * @param {Array<*>} obj
   * @returns {Array<*>}
   */
  function projectSinksOn(prop, obj) {
    return mapR(x => x ? x[prop] : null, obj)
  }

  /**
   * Merges the DOM nodes produced by a parent component with the DOM nodes
   * produced by children components, such that the parent DOM nodes
   * wrap around the children DOM nodes
   * For instance:
   * - parent -> div(..., [h2(...)])
   * - children -> [div(...), button(...)]
   * - result : div(..., [h2(...), div(...), button(...)])
   * @param {Sinks} parentSinks
   * @param {Array<Sinks>} childrenSinks
   * @returns {Observable<VNode>|Null}
   */
  function mergeDOMSinksDefault(parentSinks, childrenSinks) {
    const allSinks = flatten([parentSinks, childrenSinks])
    const allDOMSinks = removeNullsFromArray(projectSinksOn('DOM', allSinks))
    var parentDOMSink = parentSinks ? parentSinks.DOM : null

    // Edge case : none of the sinks have a DOM sink
    // That should not be possible as we come here only
    // when we detect a DOM sink
    if (allDOMSinks.length === 0) {return null}

    return $.combineLatest(allDOMSinks)
      .map(mergeChildrenIntoParentDOM(parentDOMSink))
  }

  function mergeNonDomSinksDefault(parentSinks, childrenSinks, sinkName) {
    const allSinks = flatten([parentSinks, childrenSinks])

    // The edge case when none of the sinks have a non-DOM sink
    // should never happen as we come here only when we have a sink name
    // which is not a DOM sink
    return $.merge(removeNullsFromArray(projectSinksOn(sinkName, allSinks)))
  }

  function makeDefaultMergedSinks(parentSinks, childrenSinks) {
    return function setDefaultSinks(accSinks, sinkName) {
      let value

      if (sinkName === 'DOM') {
        value = mergeDOMSinksDefault(parentSinks, childrenSinks)
      } else {
        value = mergeNonDomSinksDefault(parentSinks, childrenSinks, sinkName)
      }

      accSinks[sinkName] = value
      return accSinks
    }
  }

  /**
   * Is the merge function that will be used to merge parent sinks to children
   * sinks when none other is specified :
   * - DOM sinks are merged so that parent DOM sink comes first,
   *   and then children sinks in array order
   * - other sinks are merged through a simple `$.merge`
   * @param {Sinks|Null} parentSinks
   * @param {Array<Sinks>} childrenSinks
   * @param {Settings} settings
   * @returns {Sinks}
   */
  function mergeSinksDefault(parentSinks, childrenSinks, settings) {
    const allSinks = flatten(removeNullsFromArray([parentSinks, childrenSinks]))
    const sinkNames = uniq(flatten(mapR(keys, allSinks)))

    return reduceR(
      // Note : default merge does not make use of the settings!
      makeDefaultMergedSinks(parentSinks, childrenSinks), {}, sinkNames
    )
  }

  // Testing utilities
  const defaultTimeUnit = 50

  /**
   *
   * @param {String} _diagram
   * @param {{timeUnit:Number, errorValue:Object, values:Object}} opt
   * @returns {{sequence: Array, completeDelay: undefined}}
   */
  function parseDiagram(_diagram, opt) {
    const diagram = _diagram.trim()
    const timeUnit = (opt && opt.timeUnit) ? opt.timeUnit : defaultTimeUnit
    const errorVal = (opt && opt.errorValue) ? opt.errorValue : '#'
    const values = (opt && opt.values) ? opt.values : {};

    let sequence = []
    let completeDelay = undefined

    const L = diagram.length
    for (let i = 0; i < L; i++) {
      const c = diagram[i];
      const time = timeUnit * i;
      switch (c) {
        case '-':
          sequence.push({type: 'none'})
          break;
        case '#':
          sequence.push({type: 'error', data: errorVal, time: time})
          break;
        case '|':
          sequence.push({type: 'complete', time: time})
          completeDelay = time
          break;
        default:
          const val = values.hasOwnProperty(c) ? values[c] : c;
          sequence.push({type: 'next', data: val, time: time})
          break;
      }
    }

    return {sequence, completeDelay}
  }

  /**
   * Creates a real stream out of an ASCII drawing of a stream. Each string
   * character represents an amount of time passed.
   * `-` characters represent nothing special, `|` is a symbol to mark the
   * completion of the stream, `#` is an error on the stream, and any other
   * character is a "next" event.
   * @param {String} diagram
   * @param {Object=} opt
   */
  function makeSourceFromDiagram(diagram, opt) {
    // 1. from diagram,options, make array of values to send
    // for each, flatMap with the corresponding delay to error

    const timeUnit = opt.timeUnit || defaultTimeUnit
    const parseObj = parseDiagram(diagram, opt)
    const sequence = parseObj.sequence
    // TODO : change it to a mapping to an array, with time difference, and concatAll
    // to make sure they are passed in order
    // try also mergeAll to see if there is a difference
    // because for now, the delay does not seem to be working
    // TODO : add tests where I check that with several sources, the values are
    // emitted one after the other, roughly x seconds after one another
    // Si(t). Not possible Sm(t) < Sn(t') if t > t'
    // or write another function which takes the set of diagrams, and zips them
    // to make sure they are emitted in sync.
    // work-around : use a high-enough timeUnit (50ms seems to work)
    return $.from(sequence)
      .scan(function (acc, value) {
        acc.time = acc.time + timeUnit
        acc.value = {
          type: value.type,
          data: value.data,
          time: value.time
        }
        return acc
      }, {time: 0, value: undefined})
      .filter(x => x.type !== 'none')
      .flatMap(function (timedValue) {
        var time = timedValue.time
        var value = timedValue.value

        if (value.type === 'none') {
          console.log('parsing - at time %d: no emission', time)
          return $.empty()
        }

        if (value.type === 'next') {
          console.log('scheduling %o emission at time %d', value, time)
          return $.of(value.data).delay(time)
        }

        if (value.type === 'error') {
          console.log('parsing # at time %d: emitting error', time)
          return $.throw(value.data)
        }

        if (value.type === 'complete') {
          return $.empty()
        }
      })
      .timeInterval()
      .tap(console.log.bind(console, 'flatMap'))
      .pluck('value')
  }

  return {
    m: m,
    makeSourceFromDiagram: makeSourceFromDiagram,
    assertSignature: assertSignature,
    assertContract: assertContract,
    projectSinksOn: projectSinksOn,
    isNullableObject: isNullableObject,
    isUndefined: isUndefined,
    isFunction: isFunction,
    isObject: isObject,
    isString: isString,
    isArray: isArray,
    isObservable: isObservable,
    isOptSinks: isOptSinks,
  }
}
