/**
 * Specifications:
 * Usage : m(Router, {route: RouteSpec}, [children components])
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

  function match(routeToMatch) {
    let rm1 = routeMatcher(routeToMatch)
    let rm2 = routeMatcher(routeToMatch + '/*routeRemainder')

    return function match(incomingRoute) {
      const matched = rm1.parse(incomingRoute)
      const remainder = rm2.parse(incomingRoute)

      return {
        match: matched || remainder
      }
    }
  }

  // TODO : documentation
  // - a route$ top-level source must exist and have a given format (to specify)
  // - a previousRoute$ top-level source might have to exist too
  // - settings
  //   - sinkNames : the names of the sinks to be acted on by the router
  //                 sinks with non-included sink names will not be passed
  //                 downstream, hence will not be subscribed by the drivers
  // TODO : investigate consequences, will have to handle null sinks gracefully

  function makeAllSinks(sources, settings, childrenComponents) {
    // The sink names affected by the router need to be passed through the
    // settings parameter. As a matter of fact, we cannot know otherwise in
    // advance what are the sinks output by the children components without
    // executing all the children components.
    // However to execute the children components, we need to pass the route
    // params to the children. To get those params, in turn, we need to
    // enter the observable monad, from which we can't get out.
    // This behaviour results in having to handle null cases for sinks (some
    // sinks might be present only on some children components).
    // To avoid executing many times the `m` helper to compute the sinks,
    // that computation is executed the first time and then cached for further
    // access. On termination of the component sinks, the cache is cleaned.
    // The children components are passed a truncated version of the `route$`
    // parent source, in which the part of the route matched already by the
    // parent is removed (this allows for nested routing)

    // TODO : check that the mergeR works as expected and route$ will be the
    // new one
    //    const sinkNames = prepend('_fake', settings.sinkNames)
    const sinkNames = settings.sinkNames
    // TODO : check that sinkNames is defined (mandatory!!)
    // TODO : check that route is a string and not empty
    let route$ = sources[routeSourceName]
      .tap(console.log.bind(console, 'route$'))
      .share()
    let matchedRoute$ = route$.map(match(settings.route))
      .tap(console.warn.bind(console, 'matchedRoute$'))
      // NOTE : replaying here is mandatory and can only be here, not in route$
      // That's because the children below are wired with `flatMapLatest`
      // which itself wires AFTER the `route$` has emitted its value...
      // This is a common issue with dynamic stream graphs. Connection is a
      // side-effect, and the moment in which it happens matters
      // In short, while time is abstracted out in the case of a static
      // graph, it becomes important again in the case of a dynamic graph
      .shareReplay(1)
    let changedRouteEvents$ = matchedRoute$
      .pluck('match')
      .distinctUntilChanged(x=> {
        console.log('distinctUntilChanged on : ', x ? omit(['routeRemainder'], x) : null)
        return x ? omit(['routeRemainder'], x) : null
      })
      .tap(console.warn.bind(console, 'changedRouteEvents$'))
      .share()
    let cachedSinksS = new Rx.ReplaySubject(1)

    changedRouteEvents$
      .map(function (params) {
        let cachedSinks
        if (params != null) {
          // compute the children components sinks if not done already
          //              if (!cachedSinks) {
          console.info('computing children components sinks', params)
          const componentFromChildren = m({
              makeLocalSources: function (sources) {
                return {
                  route$: matchedRoute$
                    .map(pathR(['match', 'routeRemainder']))
                    .tap(console.warn.bind(console, 'routeRemainder: '))
                    .share(),
                }
              },
            }, {routeParams: omit(['routeRemainder'], params)},
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
        [sinkName]: $.zip(cachedSinksS, changedRouteEvents$, (cachedSinks, params) => {
            if (params != null) {
              return cachedSinks[sinkName] != null ?
                cachedSinks[sinkName]
                  .tap(console.log.bind(console, 'sink ' + sinkName + ':'))
                  .finally(_ => {
                    console.log('sink ' + sinkName + ': terminating due to' +
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

    return mergeAllR(mapR(makeRoutedSink, sinkNames))

    // NOTE : source.onRoute$ is there
    // source.onRoute$ will emit anytime the route has changed
    // - null : the new route does not match the configured route
    //   + stop all component sinks
    // - params : the new route does match the configured route
    //   + start the component sinks if the params are different from the
    // previous params
    // Be careful with keeping previousRoute with a `scan` here because
    // if there is a router component upwards, there might be unsubscribing,
    // resubscribing happening which destroy the state hold by that scan...
    // TODO : source.onRoute$ must be shared!! but not sharedReplayed it has to
    // be an event OR??

    // TODO: might need a top level previousRoute$ source
    // like m(Router, ...) which only create route$, and previousRoute$, so it
    // never completes
  }

  return {
    makeAllSinks: makeAllSinks
  }
}

// TODO : add test also for sinks settings : all there, missing some, extra,
// none

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
