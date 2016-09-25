define(function (require) {
  const R = require('ramda');
  const Rx = require('rx');
  const $ = Rx.Observable;
  const Sdom = require('cycle-snabbdom')

  return require_util(Rx, $, R, Sdom);
})

function require_util(Rx, $, R, Sdom) {
  const {h, div, span} = Sdom
  const {
      mapObjIndexed, flatten, keys, always, reject, isNil, uniq,
      merge, reduce, all, either, clone, map, values, equals, concat
  } = R
  const mapIndexed = R.addIndex(R.map)
  const deepMerge = function deepMerge(a, b) {
    return (R.is(Object, a) && R.is(Object, b)) ? R.mergeWith(deepMerge, a, b) : b;
  }

  // Configuration
  // TODO : put all constant like this is a prop file with a json object
  // TODO : make it an optional setting to be passed to the router
  // TODO : put the m helper in a separate file (combinator? like the router)
  // organized by category, here the category is sources
  const routeSourceName = 'route$'
  const defaultMergeSinkConfig = {
    DOM: computeDOMSinkDefault,
    _default: computeSinkDefault
  }

  /**
   * Merges the DOM nodes produced by a parent component with the DOM nodes
   * produced by children components, such that the parent DOM nodes
   * wrap around the children DOM nodes
   * For instance:
   * - parent -> div(..., [h2(...)])
   * - children -> [div(...), button(...)]
   * - result : div(..., [h2(...), div(...), button(...)])
   * @param {Sink} parentDOMSinkOrNull
   * @param {Array<Sink>} childrenSink
   * @param {Settings} settings
   * @returns {Observable<VNode>|Null}
   */
  function computeDOMSinkDefault(parentDOMSinkOrNull, childrenSink, settings) {
    // We want `combineLatest` to still emit the parent DOM sink, even when
    // one of its children sinks is empty, so we modify the children sinks
    // to emits ONE `Null` value if it is empty
    // Note : in default function, settings parameter is not used
    const childrenDOMSinkOrNull = map(emitNullIfEmpty, childrenSink)

    const allSinks = flatten([parentDOMSinkOrNull, childrenDOMSinkOrNull])
    const allDOMSinks = removeNullsFromArray(allSinks)

    // Edge case : none of the sinks have a DOM sink
    // That should not be possible as we come here only
    // when we detect a DOM sink
    if (allDOMSinks.length === 0) {
      throw `mergeDOMSinkDefault: internal error!`
    }

    return $.combineLatest(allDOMSinks)
        .tap(console.log.bind(console, 'mergeDOMSinkDefault: allDOMSinks'))
        .map(mergeChildrenIntoParentDOM(parentDOMSinkOrNull))
  }

  function computeSinkDefault(parentDOMSinkOrNull, childrenSink, settings) {
    const allSinks = concat([parentDOMSinkOrNull], childrenSink)

    // Nulls have to be removed as a given sink name will not be in all children
    // sinks. It is however guaranteed by the caller that the given sink
    // name will be in at least one of the children. Hence the merged array
    // is never empty
    return $.merge(removeNullsFromArray(allSinks))
  }

  // Type checking typings
  /**
   * @typedef {String} ErrorMessage
   */
  /**
   * @typedef {Boolean|Array<ErrorMessage>} SignatureCheck
   * Note : The booleam can only be true
   */

  // Component typings
  /**
   * @typedef {String} SourceName
   */
  /**
   * @typedef {String} SinkName
   */
  /**
   * @typedef {Observable} Source
   */
  /**
   * @typedef {Observable|Null} Sink
   */
  /**
   * @typedef {Object.<string, Source>} Sources
   */
  /**
   * @typedef {Object.<string, Sink>} Sinks
   */
  /**
   * @typedef {?Object.<string, ?Object>} Settings
   */
  /**
   * @typedef {function(Sink, Array<Sink>, Settings):Sink} mergeSink
   */
  /**
   * @typedef {Object} DetailedComponentDef
   * @property {?function(Sources, Settings)} makeLocalSources
   * @property {?function(Settings)} makeLocalSettings
   * @property {?function(Sources, Settings):Sinks} makeOwnSinks
   * @property {Object.<SinkName, mergeSink> | function} mergeSinks
   * @property {function(Sinks):Boolean} sinksContract
   * @property {function(Sources):Boolean} sourcesContract
   */
  /**
   * @typedef {Object} ShortComponentDef
   * @property {?function(Sources, Settings)} makeLocalSources
   * @property {?function(Settings)} makeLocalSettings
   * @property {?function(Sources, Settings):Sinks} makeOwnSinks
   * @property {function(Component, Array<Component>, Sources, Settings)}
   * computeSinks
   * @property {function(Sinks):Boolean} sinksContract
   * @property {function(Sources):Boolean} sourcesContract
   */
  /**
   * @typedef {function(Sources, Settings):Sinks} Component
   */

  ///////
  // Helpers
  function computeReducedSink(ownSinks, childrenSinks, localSettings, mergeSinks) {
    return function computeReducedSink(accReducedSinks, sinkName) {
      let mergeSinkFn = mergeSinks[sinkName]
          || defaultMergeSinkConfig[sinkName]
          || defaultMergeSinkConfig['_default']
      assertContract(isMergeSinkFn, [mergeSinkFn], 'm : mergeSinkFn' +
          ' for sink ${sinkName} must be a function : check' +
          ' parameter or default merge function!')

      if (mergeSinkFn) {
        accReducedSinks[sinkName] = mergeSinkFn(
            ownSinks ? ownSinks[sinkName] : null,
            projectSinksOn(sinkName, childrenSinks),
            localSettings
        )
      }

      return accReducedSinks
    }
  }

  /**
   * Returns a component specified by :
   * - a component definition object (nullable)
   * - settings (nullable)
   * - children components
   * Component definition default properties :
   * - mergeSinks :
   *   - DOM : mergeDOMSinksDefault
   *   - non-DOM : mergeNonDOMSinksDefault
   *   TODO : update with new definition
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
   * There are two version of definition, according to the level of
   * granularity desired : the short spec and the detailed spec :
   * - short spec :
   *   one function `makeAllSinks` which outputs the sinks from the sources,
   *   settings and children components
   * - detailed spec :
   *   several properties as detailed above
   * @param {?(DetailedComponentDef|ShortComponentDef)} componentDef
   * @param {?Object} _settings
   * @param {Array<Component>} children
   * @returns {Component}
   * @throws when type- and user-specified contracts are not satisfied
   */
  // m :: Opt Component_Def -> Opt Settings -> [Component] -> Component
  function m(componentDef, _settings, children) {
    console.groupCollapsed('Utils > m')
    console.log('componentDef, _settings, children', componentDef, _settings, children)
    // check signature
    const mSignature = [
      {componentDef: isNullableComponentDef},
      {settings: isNullableObject},
      {children: isArrayOf(isComponent)},
    ]
    //TODO : check that assert signature works with both predicate and
    // predicateWithErrorMessage
    assertSignature('m', arguments, mSignature)

    let {
        makeLocalSources, makeLocalSettings, makeOwnSinks, mergeSinks,
        computeSinks, sinksContract, sourcesContract
    } = componentDef

    // Set default values
    _settings = _settings || {}
    makeLocalSources = defaultsTo(makeLocalSources, always(null))
    makeLocalSettings = defaultsTo(makeLocalSettings, always({}))
    makeOwnSinks = defaultsTo(makeOwnSinks, always(null))
    mergeSinks = defaultsTo(mergeSinks, {})
    sinksContract = defaultsTo(sinksContract, always(true))
    sourcesContract = defaultsTo(sourcesContract, always(true))
    // TODO : add a settingsContract - can be used for components with
    // mandatory settings

    console.groupEnd()
    return function m(sources, innerSettings) {
      console.groupCollapsed('m\'ed component > Entry')
      console.log('sources, innerSettings', sources, innerSettings)

      innerSettings = innerSettings || {}
      const mergedSettings = deepMerge(innerSettings, _settings)

      assertSourcesContracts(sources, sourcesContract)

      // Computes and MERGES the extra sources which will be passed
      // to the children and this component
      // Extra sources are derived from the `sources`
      // received as input, which remain untouched
      const extendedSources = shareAllSources(
          merge(sources, makeLocalSources(sources, mergedSettings))
      )
      // Note that per `merge` ramda spec. the second object's values
      // replace those from the first in case of key conflict
      const localSettings = deepMerge(
          makeLocalSettings(mergedSettings),
          mergedSettings
      )

      let reducedSinks

      // Case : computeSinks is defined
      if (computeSinks) {
        reducedSinks = computeSinks(
            makeOwnSinks, children, extendedSources, localSettings
        )
      }
      // Case : computeSinks is not defined, merge is defined in mergeSinks
      else {
        console.groupCollapsed('m\'ed component > makeOwnSinks')
        console.log('extendedSources, localSettings', extendedSources, localSettings)
        const ownSinks = makeOwnSinks(extendedSources, localSettings)
        console.groupEnd()

        console.group('m\'ed component > computing children sinks')
        const childrenSinks = map(
            childComponent => childComponent(extendedSources, localSettings),
            children
        )
        console.groupEnd('m\'ed component > computing children sinks')

        assertContract(isOptSinks, [ownSinks], 'ownSinks must be a hash of observable sink')
        assertContract(isArrayOptSinks, [childrenSinks], 'childrenSinks must' +
            ' be an array of sinks')

        // Merge the sinks from children and one-s own...
        // Case : mergeSinks is defined through a function
        if (isFunction(mergeSinks)) {
          console.groupCollapsed('m\'ed component > (fn) mergeSinks')
          console.log('ownSinks, childrenSinks, localSettings', ownSinks, childrenSinks, localSettings)
          reducedSinks = mergeSinks(ownSinks, childrenSinks, localSettings)
          console.groupEnd()
        }
        // Case : mergeSinks is defined through an object
        else {
          const allSinks = flatten(removeNullsFromArray([ownSinks, childrenSinks]))
          const sinkNames = getSinkNamesFromSinksArray(allSinks)

          console.groupCollapsed('m\'ed component > (obj) mergeSinks')
          console.log('ownSinks, childrenSinks, localSettings,' +
              ' (fn) mergeSinks', ownSinks, childrenSinks, localSettings, mergeSinks)
          reducedSinks = reduce(
              computeReducedSink(ownSinks, childrenSinks, localSettings, mergeSinks),
              {}, sinkNames
          )
          console.groupEnd()
        }
      }

      assertSinksContracts(reducedSinks, sinksContract)

      const tracedSinks = trace(reducedSinks, mergedSettings)
      // ... and add tracing information(sinkPath, timestamp, sinkValue/sinkError) after each sink
      // TODO : specify trace/debug/error generation information
      // This would ensure that errors are automatically and systematically
      //       caught in the component where they occur, and not
      //       interrupting the application implementation-wise, it might be
      //       necessary to add a `currentPath` parameter somewhere which
      //       carries the current path down the tree

      console.groupEnd()
      return tracedSinks
    }
  }

  /**
   * Throws an exception if the arguments parameter fails at least one
   * validation rule
   * Note that all arguments are mandatory, i.e. the function does not deal with
   * optional arguments
   * @param {String} fnName
   * @param {Array<*>} _arguments
   * @param {[Array<Object.<string, Predicate|PredicateWithError>>]} vRules
   * Validation rules.
   *
   * Given f(x, y) =  x + y, with x both int, in the body of `f`, include
   * function f(x, y) {
   *   assertSignature ('f', arguments, [{x:isInteger},{y:isInteger}],
   *                  'one of the parameters is not an integer!')
   *   ...
   * }
   */
  function assertSignature(fnName, _arguments, vRules) {
    const argNames = flatten(map(keys, vRules))
    const ruleFns = flatten(map(function (vRule) {
      return values(vRule)[0]
    }, vRules))

    const args = mapIndexed(function (vRule, index) {
      return _arguments[index]
    }, vRules)

    const validatedArgs = mapIndexed((value, index) => {
      const ruleFn = ruleFns[index]
      return ruleFn(value)
    }, args)

    const hasFailed = reduce((acc, value) => {
      return isFalse(value) || acc
    }, false, validatedArgs)

    if (hasFailed) {
      const validationMessages = mapIndexed((errorMessageOrBool, index) => {
            return isTrue(errorMessageOrBool) ?
                '' :
                [
                  `${fnName}: argument ${argNames[index]} fails rule ${vRules[index].name}`,
                  isBoolean(errorMessageOrBool) ? '' : errorMessageOrBool
                ].join(': ')
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
   * @param {function(*): (Boolean|String)} contractFn Predicate that must be
   * satisfy. Returns true if predicate is satisfied, otherwise return a
   * string to report about the predicate failure
   * @param {Array<*>} contractArgs
   * @param {String} errorMessage
   * @returns {Boolean}
   * @throws
   */
  function assertContract(contractFn, contractArgs, errorMessage) {
    const boolOrError = contractFn.apply(null, contractArgs)
    const isPredicateSatisfied = isBoolean(boolOrError)

    if (!isPredicateSatisfied) {
      throw `assertContract: fails contract ${contractFn.name}\n${errorMessage}\n ${boolOrError}`
    }
    return true
  }

  /**
   * Returns:
   * - `true` if the object passed as parameter passes all the predicates on
   * its properties
   * - an array with the concatenated error messages otherwise
   * @param obj
   * @param {Object.<string, Predicate>} signature
   * @param {Object.<string, string>} signatureErrorMessages
   * @param {Boolean=false} strict When `true` signals that the object
   * should not
   * have properties other than the ones checked for
   * @returns {Boolean | Array<String>}
   */
  function checkSignature(obj, signature, signatureErrorMessages, isStrict) {
    let arrMessages = []
    let strict = defaultsTo(isStrict, false)

    mapObjIndexed((value, property) => {
      if (!(property in signature)) {
        // Case : the object has a property for which no contract is set up
        if (strict) {
          // Case : if strict is true, that means that the object should not
          // have that property
          arrMessages.push(`Object cannot contain a property called ${property}`)
        }
      } else if (!signature[property](value)) {
        arrMessages.push(signatureErrorMessages[property])
      }
    }, obj)

    return arrMessages.join("").length === 0 ? true : arrMessages
  }

  /**
   * Returns an object whose keys :
   * - the first key found in `obj` for which the matching predicate was
   * fulfilled. Predicates are tested in order of indexing of the array.
   * - `_index` the index in the array where a predicate was fulfilled if
   * any, undefined otherwise
   * Ex : unfoldObjOverload('DOM', {sourceName: isString, predicate:
    * isPredicate})
   * Result : {sourceName : 'DOM'}
   * @param obj
   * @param {Array<Object.<string, Predicate>>} overloads
   * @returns {{}}
   */
  function unfoldObjOverload(obj, overloads) {
    let result = {}
    let index = 0

    overloads.some(overload => {
      // can only be one property
      const property = keys(overload)[0]
      const predicate = values(overload)[0]
      const predicateEval = predicate(obj)

      if (predicateEval) {
        result[property] = obj
        result._index = index
      }
      index++

      return predicateEval
    })
    return result
  }

  function defaultsTo(obj, defaultsTo) {
    return !obj ? defaultsTo : obj
  }

  /**
   * Returns true iff the parameter is a boolean whose value is false.
   * This hence does both type checking and value checking
   * @param obj
   * @returns {boolean}
   */
  function isFalse(obj) {
    return isBoolean(obj) ? !obj : false
  }

  /**
   * Returns true iff the parameter is a boolean whose value is false.
   * This hence does both type checking and value checking
   * @param obj
   * @returns {boolean}
   */
  function isTrue(obj) {
    return isBoolean(obj) ? obj : false
  }

  function isMergeSinkFn(obj) {
    return isFunction(obj)
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

  /**
   *
   * @param obj
   * @returns {SignatureCheck}
   */
  function isNullableComponentDef(obj) {
    // Note that `==` is used instead of `===`
    // This allows to test for `undefined` and `null` at the same time

    return isNil(obj) || checkSignature(obj, {
          makeLocalSources: either(isNil, isFunction),
          makeLocalSettings: either(isNil, isFunction),
          makeOwnSinks: either(isNil, isFunction),
          mergeSinks: mergeSinks => {
            if (obj.computeSinks) {
              return !mergeSinks
            }
            else {
              return either(isNil, either(isObject, isFunction))(mergeSinks)
            }
          },
          computeSinks: either(isNil, isFunction),
          sinksContract: either(isNil, isFunction)
        }, {
          makeLocalSources: 'makeLocalSources must be undefined or a function',
          makeLocalSettings: 'makeLocalSettings must be undefined or a' +
          ' function',
          makeOwnSinks: 'makeOwnSinks must be undefined or a function',
          mergeSinks: 'mergeSinks can only be defined when `computeSinks` is' +
          ' not, and when so, it must be undefined, an object or a function',
          computeSinks: 'computeSinks must be undefined or a function',
          sinksContract: 'sinksContract must be undefined or a function'
        }, true)
  }

  function isUndefined(obj) {
    return typeof obj === 'undefined'
  }

  function isFunction(obj) {
    return typeof(obj) === 'function'
  }

  function isObject(obj) {
    return typeof(obj) == 'object'
  }

  function isBoolean(obj) {
    return typeof(obj) == 'boolean'
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

      return all(predicateFn, obj)
    }
  }

  function isVNode(obj) {
    return ["children", "data", "elm", "key", "sel", "text"]
        .every(prop => prop in obj)
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

  function isSource(obj) {
    return isObservable(obj)
  }

  function isSources(obj) {
    // We check the minimal contract which is not to be nil
    // In `cycle`, sources can have both regular
    // objects and observables (sign that the design could be improved).
    // Regular objects are injected dependencies (DOM, router?) which
    // are initialized in the drivers, and should be separated from
    // `sources`. `sources` could then have an homogeneous type which
    // could be checked properly
    return !isNil(obj)
  }

  function isOptSinks(obj) {
    // obj can be null
    return !obj || all(either(isNil, isObservable), values(obj))
  }

  function isArrayOptSinks(arrSinks) {
    return all(isOptSinks, arrSinks)
  }

  function assertSourcesContracts(sources, sourcesContract) {
    // Check sources contracts
    assertContract(isSources, [sources],
        'm : `sources` parameter is invalid')
    // TODO : documentation - contract for sources could :
    // - check that specific sources are included, and/or observable
    assertContract(sourcesContract, [sources], 'm: `sources`' +
        ' parameter fails contract ' + sourcesContract.name)
  }

  function assertSinksContracts(sinks, sinksContract) {
    assertContract(isOptSinks, [sinks],
        'mergeSinks must return a hash of observable sink')
    assertContract(sinksContract, [sinks],
        'fails custom contract ' + sinksContract.name)
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

  function removeEmptyVNodes(arrVNode) {
    return reduce((accNonEmptyVNodes, vNode) => {
      return (isNullVNode(vNode)) ?
          accNonEmptyVNodes :
          (accNonEmptyVNodes.push(vNode), accNonEmptyVNodes)
    }, [], arrVNode)
  }

  function isNullVNode(vNode) {
    return
    equals(vNode.children, []) &&
    equals(vNode.data, {}) &&
    isUndefined(vNode.elm) &&
    isUndefined(vNode.key) &&
    isUndefined(vNode.sel) &&
    isUndefined(vNode.text)
  }

  function mergeChildrenIntoParentDOM(parentDOMSink) {
    return function mergeChildrenIntoParentDOM(arrayVNode) {
      // We remove null elements from the array of vNode
      // We can have a null vNode emitted by a sink if that sink is empty
      let _arrayVNode = removeEmptyVNodes(removeNullsFromArray(arrayVNode))
      assertContract(isArrayOf(isVNode), [_arrayVNode], 'DOM sources must' +
          ' stream VNode objects! Got ' + _arrayVNode)

      if (parentDOMSink) {
        // Case : the parent sinks have a DOM sink
        // We want to put the children's DOM **inside** the parent's DOM
        // Two cases here :
        // - The parent's vNode has a `text` property :
        //   we move that text to a text vNode at first position in the children
        //   then we add the children's DOM in last position of the
        // existing parent's children
        // - The parent's vNode does not have a `text` property :
        //   we just add the children's DOM in last position of the exisitng
        //   parent's children
        // Note that this is specific to the snabbdom vNode data structure
        // Note that we defensively clone vNodes so the original vNode remains
        // immuted
        let parentVNode = clone(_arrayVNode.shift())
        let childrenVNode = _arrayVNode
        parentVNode.children = clone(parentVNode.children) || []

        // childrenVNode could be null if all children sinks are empty
        // observables, in which case we just return the parentVNode
        if (childrenVNode) {
          if (parentVNode.text) {
            parentVNode.children.splice(0, 0, {
              children: [],
              "data": {},
              "elm": undefined,
              "key": undefined,
              "sel": undefined,
              "text": parentVNode.text
            })
            parentVNode.text = undefined
          }
          Array.prototype.push.apply(parentVNode.children, childrenVNode)
        }

        return parentVNode
      }
      else {
        // Case : the parent sinks does not have a DOM sink
        // To avoid putting an extra `div` when there is only one vNode
        // we put the extra `div` only when there are several vNodes
        switch (_arrayVNode.length) {
          case 0 :
            return null
          case 1 :
            return _arrayVNode[0]
          default :
            return div(_arrayVNode)
        }
//        return _arrayVNode.length === 1 ? _arrayVNode[0] : div(_arrayVNode)
        //        return div(arrayVNode)
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
    return map(x => x ? x[prop] : null, obj)
  }

  /**
   * Returns an array with the set of sink names extracted from an array of
   * sinks. The ordering of those names should not be relied on.
   * For instance:
   * - [{DOM, auth},{DOM, route}]
   * results in ['DOM','auth','route']
   * @param {Array<Sinks>} aSinks
   * @returns {Array<String>}
   */
  function getSinkNamesFromSinksArray(aSinks) {
    return uniq(flatten(map(getValidKeys, aSinks)))
  }

  function getValidKeys(obj) {
    let validKeys = []
    mapObjIndexed((value, key) => {
      if (value != null) {
        validKeys.push(key)
      }
    }, obj)

    return validKeys
  }

  /**
   * Turns a sink which is empty into a sink which emits `Null`
   * This is necessary for use in combination with `combineLatest`
   * As a matter of fact, `combineLatest(obs1, obs2)` will block till both
   * observables emit at least one value. So if `obs2` is empty, it will
   * never emit anything
   * @param sink
   * @returns {Observable|*}
   */
  function emitNullIfEmpty(sink) {
    return isNil(sink) ?
        null :
        $.merge(
            sink,
            sink.isEmpty().filter(x=>x).map(x => null)
        )
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
    // We want `combineLatest` to still emit the parent DOM sink, even when
    // one of its children sinks is empty, so we modify the children sinks
    // to emits ONE `Null` value if it is empty
    const childrenDOMSinksOrNull = map(emitNullIfEmpty, projectSinksOn('DOM', childrenSinks))
    const parentDOMSinksOrNull = projectSinksOn('DOM', [parentSinks])

    const allSinks = flatten([parentDOMSinksOrNull, childrenDOMSinksOrNull])
    const allDOMSinks = removeNullsFromArray(allSinks)
    var parentDOMSink = parentSinks ? parentSinks.DOM : null

    // Edge case : none of the sinks have a DOM sink
    // That should not be possible as we come here only
    // when we detect a DOM sink
    if (allDOMSinks.length === 0) {
      throw 'mergeDOMSinksDefault: internal' +
      ' error!'
    }

    return $.combineLatest(allDOMSinks)
        .tap(console.log.bind(console, 'mergeDOMSinksDefault: allDOMSinks'))
        .map(mergeChildrenIntoParentDOM(parentDOMSink))
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
    const sinkNames = getSinkNamesFromSinksArray(allSinks)

    return reduce(
        // Note : default merge does not make use of the settings!
        makeDefaultMergedSinks(parentSinks, childrenSinks), {}, sinkNames
    )
  }

  function makeDivVNode(x) {
    return {
      "children": undefined,
      "data": {},
      "elm": undefined,
      "key": undefined,
      "sel": "div",
      "text": x
    }
  }

  return {
    m: m,
    makeDivVNode: makeDivVNode,
    assertSignature: assertSignature,
    assertContract: assertContract,
    checkSignature: checkSignature,
    unfoldObjOverload: unfoldObjOverload,
    projectSinksOn: projectSinksOn,
    getSinkNamesFromSinksArray: getSinkNamesFromSinksArray,
    removeNullsFromArray: removeNullsFromArray,
    defaultsTo: defaultsTo,
    isNullableObject: isNullableObject,
    isUndefined: isUndefined,
    isFunction: isFunction,
    isVNode: isVNode,
    isObject: isObject,
    isBoolean: isBoolean,
    isString: isString,
    isArray: isArray,
    isArrayOf: isArrayOf,
    isObservable: isObservable,
    isSource: isSource,
    isOptSinks: isOptSinks,
  }
}
