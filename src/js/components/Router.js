/**
 * Specifications:
 * Usage : m(Router, {route: '/:user/:id'}, [children])
 */

m(Router, {route: 'dash/being'}, [children])

define(function (require) {
  const R = require('ramda');
  const Rx = require('rx');
  const $ = Rx.Observable;
  const Sdom = require('cycle-snabbdom')

  return require_router_component(Rx, $, R, Sdom);
})

function require_router_component(Rx, $, R, Sdom) {
  const h = Sdom.h
  const div = Sdom.div
  const span = Sdom.span

  const mapR = R.map
  const mapObjIndexed = R.mapObjIndexed
  const mapIndexed = R.addIndex(R.map)
  const mergeR = R.merge
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


}

// Use case : non-nested routing
m(Router, {route: '/:user/:id'}, [
  m(Component, ...)
])
// All the children components below the Router component will be :
// - activated when the `route` setting matches the incoming route
// - terminated when the `route` setting does not match the incoming route
// - reactivated when the incoming route has changed but still matches
//   That's the case for example with :
//     {user: 'bruno', id: 1} -> {user: 'bruno', id: 2}

// Use case : nested routing
m(Router, {route: '/:user/'}, [
  m(Component1, [
    m(Router, {route: '/:user/:id'}, [
      m(Component2, ...)
    ])
  ])
])
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
m(Router, {route: '/:user/'}, [
  m(Component1, [
    m(Router, {route: '/*/:id'}, [
      m(Component2, ...)
    ])
  ])
])

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

function makeRouterSources(sources, settings) {
  return {
    // TODO : match function
    // `match` returns null if no match, {} if no params, otherwhise {something} if params
    // onRoute$ :: Observable <Opt RouteParams>
    // RouteParams :: Opt Hash *
    onRoute$: sources.route$.map(match(settings.route))
  }
}

// TODO : I cannot do it with the current componentDef, I need to add a function
// which takes the execution of the children into its hand
// makeAllSinks (sources, settings, childrenComponents)

// Configuration
const routeSourceName = 'route$'

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
  const sinkNames = settings.sinkNames
  let route$ = sources[routeSourceName]
  let cachedSinks = undefined

  return mergeR.apply(null, mapR(function makeRoutedSink(sinkName) {
      return {
        [sinkName]: route$.map(match(settings.route)).distinctUntilChanged()
          .flatMapLatest(params => {
            if (params != null) {
              cachedSinks = cachedSinks || m({
                  makeLocalSources: sources => ({
                    route$: removeAlreadyMatchedRoute(sources.route$)
                  }),
                }, {routeParams: params}, childrenComponents)
              return cachedSinks[sinkName] != null ?
                cachedSinks[sinkName]
                  .finally(function () {cachedSinks = undefined}) :
                $.empty()
            }
            else {
              return $.empty()
            }
          })
      }
    }
    , sinkNames))


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


  // I need to call the component with the param as settings
  return sources.onRoute$.distinctUntilChanged().map(params => {
    return mapR(component => {
      mapObjIndexed((sink, sinkName) => {
        // stop the sink when params changes...
        return sink.takeUntil(sources.onRoute$.distinctUntilChanged())
        // TODO : might be a .skip(1) here to stop on the next value, to test
        // case when the sources.onRoute$ terminates also to investigate
        // basically test that nested routing works fine with a component
        // writing 100 values in 100s, if the component is terminated I will
        // know
      }, component(sources, mergeParams(settings, params)))
    }, childrenComponents)
  })
  // at this point we have an Array<Sinks>
  // which need to be merge
    .let(mergeSinks)
  // TODO : could be able to use m({localSources : onRoute$ remove the
  // path matched by the parent, that also means that onRoute$ needs to
  // pass the route also not only the params...}, []) though that would add a
  // div on the dom side
  // TODO: might need a top level previousRoute$ source
  // like m(Router, ...) which only create route$, and previousRoute$, so it
  // never completes
}

// TODO : write the tests first!!!

// Takes all the children sinks and :
// - terminates them if the incoming route does not match
// - merges them (per sink name) if the incoming route matches
// Returns the merged sinks
function mergeSinksAndTakeUntilRouteChanges(childrenSinks, onRoute$) {
  // getSinkNames :: Sinks -> [String]
  // map :: [T] -> (T -> U) -> [U]
  // flatten :: [[T]] -> [T]
  // map(childrenSinks, getSinkNames) -> [[String]]
  // flatten(map(childrenSinks, getSinkNames)) -> [String]
  var sinkNames = flatten(map(childrenSinks, getSinkNames));
  // Create sinks with only empty observables for initializing the reducer
  // reduce :: [T] -> (U -> T -> U) -> U -> U
  var emptySinks = reduce(sinkNames, (x, sinkName) => (x[sinkName] = $.empty(), x), {})
  // outputSinks :: Sinks
  var outputSinks = reduce(sinkNames, makeMergedSinks(childrenSinks, onRoute$), emptySinks)
  return outputSinks
}

function makeMergedSinks(childrenSinks, onRoute$) {
  // makeSink :: Hash Observable *, i.e. Sinks
  return function makeSink(outputSinks, sinkName) {
    // map :: [T] -> (T -> U) -> [U]
    // projectChildrenSinks :: [Sinks] -> String -> [Sink]
    function projectChildrenSinks(childrenSinks, sinkName) {
      return map(childrenSinks,
        sinks => {
          const sink = sinks[sinkName]
          return either(sink,
            // When the incoming route is matched (`filter`):
            // - the previous sinks are terminated... (`flatMapLatest`)
            // - and replaced by the incoming route corresponding sinks...
            // When the incoming route does not match:
            // - the current sinks are terminated (`takeUntil`)
            onRoute$.filter(x => !!x).flatMapLatest(_ => sink.takeUntil(onRoute$.filter(x => !x))),
            // If there are no sinks with that name, an empty observable is passed
            $.empty())
        }
      )
    }

    // The default merge behaviour is the following :
    // - DOM sinks are merged with `mergeDOMSinksDefault`
    // Reminder :
    // `$.combineLatest(childrenSinks.map(x => x.DOM)).map(arrayVNode => div(arrayVNode))`
    // - Non-DOM sinks are merged with `mergeNonDomSinksDefault`
    outputSinks[sinkName] = mergeSinksDefault(projectChildrenSinks(childrenSinks, sinkName));

    return outputSinks
  }
}
