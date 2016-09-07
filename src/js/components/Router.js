/**
 * Specifications:
 * Usage : m(Router, {route: RouteSpec, sinkNames: [...]}, [children
 * components])
 */

define(function (require) {
  const U = require('util')
  const R = require('ramda')
  const Rx = require('rx')
  const $ = Rx.Observable
  const Sdom = require('cycle-snabbdom')
  const routeMatcher = require('route_matcher').routeMatcher

  return require_router_component(Rx, $, U, R, Sdom, routeMatcher)
})

function require_router_component(Rx, $, U, R, Sdom, routeMatcher) {
  const h = Sdom.h
  const div = Sdom.div
  const span = Sdom.span

  const assertSignature = U.assertSignature
  const isString = U.isString
  const isArray = U.isArray
  const m = U.m

  const mapR = R.map
  const mapObjIndexed = R.mapObjIndexed
  const mapIndexed = R.addIndex(R.map)
  const mergeR = R.merge
  const mergeAllR = R.mergeAll
  const valuesR = R.values
  const eitherR = R.either
  const flatten = R.flatten
  const allR = R.all
  const keys = R.keys
  const reduceR = R.reduce
  const always = R.always
  const reject = R.reject
  const isNil = R.isNil
  const uniq = R.uniq
  const omit = R.omit
  const pathR = R.path
  const prepend = R.prepend

  // Configuration
  const routeSourceName = 'route$'

  ///////////
  // Helpers
  function match(routeToMatch) {
    let rm1 = routeMatcher(routeToMatch)
    let rm2 = routeMatcher(routeToMatch + '/*routeRemainder')

    return function match(incomingRoute) {
      if (isNil(incomingRoute)) {
        return {
          match: null
        }
      }

      const matched = rm1.parse(incomingRoute)
      const remainder = rm2.parse(incomingRoute)

      return {
        match: matched || remainder
      }
    }
  }

  function isRouteSettings(obj) {
    return obj.route && isString(obj.route) &&
      obj.sinkNames && isArray(obj.sinkNames) && obj.sinkNames.length > 0
  }

  /**
   * Definition for a router component which :
   * - will pass the sinks of its children components iff the new route
   * matches the route configured for the components
   * - when the route no longer matches, components sinks are terminated
   * - when the route matches, changes but keeps the same value, children
   * sinks remain in place
   * Route information is read on the `route$` property
   * Children components pass to their own children a `route$` which is the
   * `route$` they received from their parent, from which they remove the
   * part of the route that they have matched (passing what is called here the
   * remainder).
   * Params parsed from the matched route are passed to the children
   * component through their `settings` parameters, with the `routeParams`
   * property.
   * The `route$` property can be but should not be manipulated directly out
   * of a `Router` component.
   *
   * Two settings are necessary :
   * - route : the route which triggers the component sinks activation.
   *   1. Note that a route value of `undefined` will produce no matching,
   *   while a value of `""` will match `":user"` !
   *   2. Every new nested route will trigger the emission of a nested route
   *   value, even if that new nested route value is the same as the
   *   previous one.
   *
   * - sinkNames : the list of sinks (names) which must be activated in
   * response to the matching route
   *
   * @param {Sources} sources
   * @param {{route: string, sinkNames: Array<string>, trace: string}} settings
   * @param {Array<Component>} childrenComponents
   */
  function makeAllSinks(sources, settings, childrenComponents) {
    console.group('makeAllSinks')
    console.log('sources, settings, childrenComponents', sources, settings, childrenComponents);

    const signature = [{settings: isRouteSettings},]

    assertSignature('makeAllSinks', [settings], signature)

    // The sink names are necessary as we cannot know otherwise in
    // advance what are the sinks output by the children components without
    // executing all the children components.
    // However to execute the children components, we need to pass the route
    // params to the children. To get those params, in turn, we need to
    // enter the observable monad, from which we can't get out.
    // This behaviour results in having to handle null cases for sinks (some
    // sinks might be present only on some children components).
    const sinkNames = settings.sinkNames
    const trace = 'router:' + (settings.trace || "")

    let route$ = sources[routeSourceName]
      .tap(console.error.bind(console, 'route$'))

    let matchedRoute$ = route$.map(match(settings.route))
      .tap(console.warn.bind(console, trace + '|matchedRoute$'))
      // NOTE : replaying here is mandatory
      // That's because the children are passed `matchedRoute` and
      // connect to it AFTER the `route$` has emitted its value...
      // In short, while time is abstracted out in the case of a static
      // graph, dynamic stream graphs come with synchronization pains
      .shareReplay(1)

    let changedRouteEvents$ = matchedRoute$
      .pluck('match')
      .distinctUntilChanged(x=> {
        console.log('distinctUntilChanged on : ', x ? omit(['routeRemainder'], x) : null)
        return x ? omit(['routeRemainder'], x) : null
      })
      .tap(console.warn.bind(console, 'changedRouteEvents$'))
      .share()
    // Note : must be shared, used twice here

    let cachedSinksS = new Rx.ReplaySubject(1)

    // I had tested with executing the `m` helper as many times as sources,
    // and it seems to work. It is however inefficient as this means
    // computing unnecessarily the whole component tree under the current
    // component node. And that for every component...
    // A naive cache solution gives very close results but shows
    // synchronization problem that could not be solved (cache is reset
    // too late or too early).
    // The current solution consists in using a subject for caching, and
    // wiring that subject so that its flow executed before the others, so
    // its cache value is available before it is being needed.
    // Then dependent flows are forcibly synchronised and combined with
    // `zip` from which the cached sinks are distributed into their
    // destination sinks
    // Sinks who no longer match a given route are terminated with
    // `takeUntil`.
    changedRouteEvents$
      .map(function (params) {
        let cachedSinks

        if (params != null) {
          console.info('computing children components sinks', params)
          const componentFromChildren = m({
              makeLocalSources: function makeLocalSources(sources, __settings) {
                console.group('makeLocalSources')
                console.log('sources, __settings', sources, __settings);
                console.groupEnd('makeLocalSources')

                return {
                  route$: matchedRoute$
                    .map(pathR(['match', 'routeRemainder']))
                    .tap(console.warn.bind(console, settings.trace + ' :' +
                      ' changedRouteEvents$' +
                      ' : routeRemainder: '))
                    .share(),
                }
              },
            }, {
              routeParams: omit(['routeRemainder'], params),
              trace: 'inner - ' + trace
            },
            childrenComponents)
          cachedSinks = componentFromChildren(sources, settings)
        }
        else {
          cachedSinks = null
        }

        return cachedSinks
      })
      .subscribe(cachedSinksS)

    function makeRoutedSink(sinkName) {
      return {
        [sinkName]: changedRouteEvents$.combineLatest(cachedSinksS,
          (params, cachedSinks) => {
            if (params != null) {
              return cachedSinks[sinkName] != null ?
                cachedSinks[sinkName]
                  .tap(console.log.bind(console, 'sink ' + sinkName + ':'))
                  .finally(_ => {
                    console.log(trace + ' : sink ' + sinkName + ': terminating due to' +
                      ' route change')
                  })
                  .takeUntil(changedRouteEvents$)
                :
                $.empty()
            }
            else {
              // new route does not match component route
              console.log('params is null!!! no match for this component on' +
                ' this route')
              return $.empty()
            }
          }
        ).switch()
      }
    }

    console.groupEnd('makeAllSinks')
    return mergeAllR(mapR(makeRoutedSink, sinkNames))
  }

  return {
    makeAllSinks: makeAllSinks
  }
}

// test
// 1. non-nested routing x components x (matches 1/no matches/matches
// 2/matches 3)
// Inputs :
// - userAction$ : '-a---b-cd---e'
// - route$ : /bruno/1, /ted, /bruno/2, bruno/3
//   i.e. 'a----b-bc---d'
// - route : '/:user/:id'
// - components :
//   -> {DOM : $.interval(100).take(2).map(x => h('span', {}, 'Component 1 :' +
// settings.routeParams.id + ' - ' + x))}
//   -> {DOM : $.interval(100).map(x => h('span', {}, 'Component 2 :' + x))}
//   also :
//   component 1 and 2 : routeLog : sources.route$.map(x => 'Component2 -
// routeLog ' + x
//   component 2 : a : sources.userAction$.map(x => 'Component2 - user action '
// + x)
// Expected :
//
// m(Router, {route: '/:user/:id', header : '!'}, [
//   Component1,
//   Component2
// ])

// All the children components below the Router component will be :
// - activated when the `route` setting matches the incoming route
// - terminated when the `route` setting does not match the incoming route
// - reactivated when the incoming route has changed but still matches
//   That's the case for example with :
//     {user: 'bruno', id: 1} -> {user: 'bruno', id: 2}

// Use case : nested routing
// m(Router, {route: '/:user/'}, [
//   m(Component1, [
//     m(Router, {route: '/:user/:id'}, [
//       m(Component2, dotdotdot)
//     ])
//   ])
// ])
//
// {user: 'bruno', id: 1} -> {user: 'bruno', id: 2} :
// - Component1 sinks will not change
// - Component2 sinks will be terminated and recreated to reflect the route change
// {user: 'bruno', id: 1} -> {user: 'tylor', id: 1} :
// - Component1 sinks will be terminated and recreated to reflect the route change
// - Component2 sinks will be terminated and recreated to reflect the route change
// {user: 'bruno', id: 1} -> {user: 'tylor', id: 2} :
// - Component1 sinks will be terminated and recreated to reflect the route change
// - Component2 sinks will be terminated and recreated to reflect the route change

// Use case : <<De-nested>> routing
// m(Router, {route: '/:user/'}, [
//   m(Component1, [
//     m(Router, {route: '/*/:id'}, [
//       m(Component2, dotdotdot)//
//     ])
//   ])
// ])

// {user: 'bruno', id: 1} -> {user: 'bruno', id: 2} :
// - Component1 sinks will not change
// - Component2 sinks will be terminated and recreated to reflect the route change
// {user: 'bruno', id: 1} -> {user: 'tylor', id: 1} :
// - Component1 sinks will be terminated and recreated to reflect the route change
// - Component2 sinks will not change
// {user: 'bruno', id: 1} -> {user: 'tylor', id: 2} :
// - Component1 sinks will be terminated and recreated to reflect the route change
// - Component2 sinks will be terminated and recreated to reflect the route change

// Routing parameters
// Parameters are passed to the children via the `onRoute$` local source
// That source emits anytime the route changes :
// - null, if the new route does not match the `route` regexp setting
// - {}, if there is no params to be passed
// - Hash * (i.e. Object) if there are parameters to be extracted from the regexp
// Hence the children will have to filter it again null values before using it
// As such those parameters are visible to all children down the tree, until
// there is another routing component which overrides it
