define(function (require) {
    var Rx = require('rx');
    return require_cycle(Rx);
});

function require_cycle(Rx) {
    function makeSinkProxies(drivers) {
        var sinkProxies = {};
        for (var name in drivers) {
            if (drivers.hasOwnProperty(name)) {
                sinkProxies[name] = new Rx.ReplaySubject(1)
            }
        }
        return sinkProxies
    }

    function callDrivers(drivers, sinkProxies) {
        var sources = {};
        for (var name in drivers) {
            if (drivers.hasOwnProperty(name)) {
                sources[name] = drivers[name](sinkProxies[name], name)
            }
        }
        return sources
    }

    function attachDisposeToSinks(sinks, replicationSubscription) {
        Object.defineProperty(sinks, 'dispose', {
            enumerable: false,
            value: function () {
                replicationSubscription.dispose()
            }
        });
        return sinks
    }

    function makeDisposeSources(sources) {
        return function dispose() {
            for (var name in sources) {
                if (sources.hasOwnProperty(name) &&
                    typeof sources[name].dispose === 'function') {
                    sources[name].dispose()
                }
            }
        }
    }

    function attachDisposeToSources(sources) {
        Object.defineProperty(sources, 'dispose', {
            enumerable: false,
            value: makeDisposeSources(sources)
        });
        return sources
    }

    function logToConsoleError(err) {
        var target = err.stack || err;
        if (console && console.error) {
            console.error(target)
        }
    }

    function replicateMany(observables, subjects) {
        return Rx.Observable.create(function (observer) {
            var subscription = new Rx.CompositeDisposable();
            setTimeout(function () {
                for (var name in observables) {
                    if (observables.hasOwnProperty(name) &&
                        subjects.hasOwnProperty(name) && !subjects[name].isDisposed) {
                        subscription.add(
                            observables[name]
                                .doOnError(logToConsoleError)
                                .subscribe(subjects[name].asObserver())
                        )
                    }
                }
                observer.onNext(subscription)
            }, 1);

            return function dispose() {
                subscription.dispose();
                for (var x in subjects) {
                    if (subjects.hasOwnProperty(x)) {
                        subjects[x].dispose()
                    }
                }
            }
        })
    }

    function isObjectEmpty(obj) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                return false
            }
        }
        return true
    }

    function run(main, drivers) {
        if (typeof main !== 'function') {
            throw new Error('First argument given to Cycle.run() must be the -main- ' +
                'function.');
        }
        if (typeof drivers !== 'object' || drivers === null) {
            throw new Error('Second argument given to Cycle.run() must be an object ' +
                'with driver functions as properties.')
        }
        if (isObjectEmpty(drivers)) {
            throw new Error('Second argument given to Cycle.run() must be an object ' +
                'with at least one driver function declared as a property.')
        }

        var sinkProxies = makeSinkProxies(drivers);
        var sources = callDrivers(drivers, sinkProxies);
        var sinks = main(sources);
        var subscription = replicateMany(sinks, sinkProxies).subscribe();
        var sinksWithDispose = attachDisposeToSinks(sinks, subscription);
        var sourcesWithDispose = attachDisposeToSources(sources);
        return {sources: sourcesWithDispose, sinks: sinksWithDispose};
    }

    var Cycle = {
        /**
         * Takes an `main` function and circularly connects it to the given collection
         * of driver functions.
         *
         * The `main` function expects a collection of "driver source" Observables
         * as input, and should return a collection of "driver sink" Observables.
         * A "collection of Observables" is a JavaScript object where
         * keys match the driver names registered by the `drivers` object, and values
         * are Observables or a collection of Observables.
         *
         * @param {Function} main a function that takes `sources` as input
         * and outputs a collection of `sinks` Observables.
         * @param {Object} drivers an object where keys are driver names and values
         * are driver functions.
         * @return {Object} an object with two properties: `sources` and `sinks`.
         * `sinks` is the collection of driver sinks, and `sources` is the collection
         * of driver sources, that can be used for debugging or testing.
         * @function run
         */
        run: run
    };
    return Cycle
}

