'use strict';

var _ = require('lodash');
var Scope = require('../src/scope');

describe('Scope', function() {

	it('can be constructed and used as an object', function() {
		var scope = new Scope();
		scope.aProperty = 1;

		expect(scope.aProperty).toBe(1);
	});

	describe('digest', function() {
		var scope;

		beforeEach(function() {
			scope = new Scope();
		});

		it('calls the listener function of a watch on first $digest', function() {
			var watchFn = function() { return 'wat'; };
			var listenerFn = jasmine.createSpy();
			scope.$watch(watchFn, listenerFn);

			scope.$digest();

			expect(listenerFn).toHaveBeenCalled();
		});

		it('calls the watch function with the scope as argument', function() {
			var watchFn = jasmine.createSpy();
			var listenerFn = function() {};
			scope.$watch(watchFn, listenerFn);

			scope.$digest();
			expect(watchFn).toHaveBeenCalledWith(scope);
		});

		it('calls the listener function when the watched value changes', function() {
			scope.someValue = 'a';
			scope.counter = 0;

			scope.$watch(
				function(scope) { return scope.someValue; },
				function(newValue, oldValue, scope) { scope.counter++; }
			);

			expect(scope.counter).toBe(0);

			scope.$digest();
			expect(scope.counter).toBe(1);

			scope.$digest();
			expect(scope.counter).toBe(1);

			scope.someValue = 'b';
			expect(scope.counter).toBe(1);

			scope.$digest();
			expect(scope.counter).toBe(2);
		});

		it('calls listener when watch value is first undefined', function() {
			scope.counter = 0;

			scope.$watch(
				function(scope) { return scope.someValue; },
				function(newValue, oldValue, scope) { scope.counter++; }
			);

			scope.$digest();
			expect(scope.counter).toBe(1);
		});

		it('calls listener with new value as old value the first time', function() {
			scope.someValue = 123;
			var oldValueGiven;

			scope.$watch(
				function(scope) { return scope.someValue; },
				function(newValue, oldValue, scope) { oldValueGiven = oldValue; }
			);

			scope.$digest();
			expect(oldValueGiven).toBe(123);
		});

		// To be notified whenever an Angular scope is digested, can make use of the fact that 
		// each watch is executed during each digest: Just register a watch without a listener function.
		it('may have watchers that omit the listener function', function() {
			var watchFn = jasmine.createSpy().and.returnValue('something');
			scope.$watch(watchFn);

			scope.$digest();
			expect(watchFn).toHaveBeenCalled();
		});

		// Problem: If listener fxn also changes properties on scope, and another watcher is looking at the property 
		//          that just changed, it might not notice the change during the same digest pass. 
		// Solution: Modify digest so that it keeps iterating over all watches until watched values stop changing. 
		//           Doing multiple passes is only way we can get changes applied for watchers that rely on other watchers.
		it('triggers chained watchers in the same digest', function() {
			scope.name = 'Jane';

			scope.$watch(
				function(scope) { return scope.nameUpper; },
				function(newValue, oldValue, scope) {
					if (newValue) {
						scope.initial = newValue.substring(0, 1) + '.';
					}
				}
			);
			scope.$watch(
				function(scope) { return scope.name; },
				function(newValue, oldValue, scope) {
					if (newValue) {
						scope.nameUpper = newValue.toUpperCase();
					}
				}
			);

			scope.$digest();
			expect(scope.initial).toBe('J.');

			scope.name = 'Bob';
			scope.$digest();
			expect(scope.initial).toBe('B.');
		});

		// Problem: 2 watches are looking at changes made by each other ==> state never stabilizes
		// 			scope.$digest does not throw an exception bc the test never finishes: 2 counters are dependent on each other, 
		// 			so on each iteration of $$digestOnce one of them is going to be dirty.
		// Solution: keep running  digest for a set # of iterations (TTL). If scope is still changing after those iterations,
		//			 throw an exception, since whatever the state of the scope is it’s unlikely to be what the user intended.
		it('gives up on the watches after 10 iterations', function() {
			scope.counterA = 0;
			scope.counterB = 0;

			scope.$watch(
				function(scope) { return scope.counterA; },
				function(newValue, oldValue, scope) { scope.counterB++; }
			);

			scope.$watch(
				function(scope) { return scope.counterB; },
				function(newValue, oldValue, scope) { scope.counterA++; }
			);

			expect((function() { scope.$digest(); })).toThrow();
		});

		// With large # of watches in a digest loop, important to execute them as few times as possible.
		// To cut # of executions in half, keep track of last watch that was dirty. 
		// Whenever encountering a clean watch, check whether it’s also the last watch that was dirty. 
		// If so, a full round has passed where no watch has been dirty ==> can exit / no need to proceed to end of current round.
		it('ends the digest when the last watch is clean', function() {
			scope.array = _.range(2);
			var watchExecutions = 0;

			_.times(2, function(i) {
				scope.$watch(
					function(scope) { 
						watchExecutions++;
						return scope.array[i];
					},
					function(newValue, oldValue, scope) {}
				);
			});

			scope.$digest();
			expect(watchExecutions).toBe(4);

			scope.array[0] = 999;
			scope.$digest();
			expect(watchExecutions).toBe(7);
		});

		// Edge case: reset $$lastDirtyWatch whenever a new watch is added 
		// Disable the optimization so that new watches are not accidentally excluded by breaking out of watcher loop
		it('does not end digest so that new watches are not run', function() {
			scope.aValue = 'abc';
			scope.counter = 0;

			scope.$watch(
				function(scope) { return scope.aValue; },
				function(newValue, oldValue, scope) {
					scope.$watch(
						function(scope) { return scope.aValue; },
						function(newValue, oldValue, scope) {
							scope.counter++;
						}
					);
				}
			);
			scope.$digest();
			expect(scope.counter).toBe(1);
		});

		// Value-Based Dirty-Checking:
		// detecting when a value inside an object or an array changes / watch for changes in value, not just in reference.
		// activated by providing a third, optional boolean flag to the $watch fxn. If true, value-based checking is used.
		it('compares based on value if enabled', function() {
			scope.aValue = [1,2,3];
			scope.counter = 0;

			scope.$watch(
				function(scope) { return scope.aValue; },
				function(newValue, oldValue, scope) { scope.counter++; },
				true
			);

			scope.$digest();
			expect(scope.counter).toBe(1);

			scope.aValue.push(4);
			scope.$digest();
			expect(scope.counter).toBe(2);
		});
	});
});

