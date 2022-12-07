var chai = require('chai'),
    URL = require('postman-collection').Url,
    Ajv = require('ajv'),
    ajv = new Ajv({ logger: console }),
    generateSchema = (function () {
        var Type = (function () {
            var isBuiltIn = (function () {
                var built_ins = [
                    Object,
                    Function,
                    Array,
                    String,
                    Boolean,
                    Number,
                    Date,
                    RegExp,
                    Error
                ];
                var built_ins_length = built_ins.length;

                return function (_constructor) {
                    for (var i = 0; i < built_ins_length; i++) {
                        if (built_ins[i] === _constructor) {
                            return true;
                        }
                    }
                    return false;
                };
            })();

            var stringType = (function () {
                var _toString = ({}).toString;

                return function (obj) {
                    // [object Blah] -> Blah
                    var stype = _toString.call(obj).slice(8, -1);

                    if ((obj === null) || (obj === undefined)) {
                        return stype.toLowerCase();
                    }

                    var ctype = of(obj);

                    if (ctype && !isBuiltIn(ctype)) {
                        return ctype.name;
                    } else {
                        return stype;
                    }
                };
            })();

            function of(obj) {
                if ((obj === null) || (obj === undefined)) {
                    return obj;
                } else {
                    return obj.constructor;
                }
            }

            function is(obj, test) {
                var typer = (of(test) === String) ? stringType : of;
                return (typer(obj) === test);
            }

            function instance(obj, test) {
                return (obj instanceof test);
            }

            function extension(_Extension, _Base) {
                return instance(_Extension.prototype, _Base);
            }

            function any(obj, tests) {
                if (!is(tests, Array)) {
                    throw ("Second argument to .any() should be array")
                }
                for (var i = 0; i < tests.length; i++) {
                    var test = tests[i];
                    if (is(obj, test)) {
                        return true;
                    }
                }
                return false;
            }

            var exports = function (obj, type) {
                if (arguments.length == 1) {
                    return of(obj);
                } else {
                    if (is(type, Array)) {
                        return any(obj, type);
                    } else {
                        return is(obj, type);
                    }
                }
            }

            exports.instance = instance;
            exports.string = stringType;
            exports.of = of;
            exports.is = is;
            exports.any = any;
            exports.extension = extension;
            return exports;

        }()),
            DRAFT = 'http://json-schema.org/draft-04/schema#';

        function getPropertyType(value) {
            var type = Type.string(value).toLowerCase()

            if (type === 'date') return 'string'
            if (type === 'regexp') return 'string'
            if (type === 'function') return 'string'

            return type
        }

        function getUniqueKeys(a, b, c) {
            a = Object.keys(a)
            b = Object.keys(b)
            c = c || []

            var value
            var cIndex
            var aIndex

            for (var keyIndex = 0, keyLength = b.length; keyIndex < keyLength; keyIndex++) {
                value = b[keyIndex]
                aIndex = a.indexOf(value)
                cIndex = c.indexOf(value)

                if (aIndex === -1) {
                    if (cIndex !== -1) {
                        // Value is optional, it doesn't exist in A but exists in B(n)
                        c.splice(cIndex, 1)
                    }
                } else if (cIndex === -1) {
                    // Value is required, it exists in both B and A, and is not yet present in C
                    c.push(value)
                }
            }

            return c;
        }

        function processArray(array, output, nested) {
            var format
            var oneOf
            var type

            if (nested && output) {
                output = { items: output }
            } else {
                output = output || {}
                output.type = getPropertyType(array)
                output.items = output.items || {}
                type = output.items.type || null
            }

            // Determine whether each item is different
            for (var arrIndex = 0, arrLength = array.length; arrIndex < arrLength; arrIndex++) {
                var elementType = getPropertyType(array[arrIndex])
                var elementFormat = getPropertyFormat(array[arrIndex])

                if (type && elementType !== type) {
                    output.items.oneOf = []
                    oneOf = true
                    break
                } else {
                    type = elementType
                    format = elementFormat
                }
            }

            // Setup type otherwise
            if (!oneOf && type) {
                output.items.type = type
                if (format) {
                    output.items.format = format
                }
            } else if (oneOf && type !== 'object') {
                output.items = {
                    oneOf: [{ type: type }],
                    required: output.items.required
                }
            }

            // Process each item depending
            if (typeof output.items.oneOf !== 'undefined' || type === 'object') {
                for (var itemIndex = 0, itemLength = array.length; itemIndex < itemLength; itemIndex++) {
                    var value = array[itemIndex]
                    var itemType = getPropertyType(value)
                    var itemFormat = getPropertyFormat(value)
                    var arrayItem
                    if (itemType === 'object') {
                        if (output.items.properties) {
                            output.items.required = getUniqueKeys(output.items.properties, value, output.items.required)
                        }
                        arrayItem = processObject(value, oneOf ? {} : output.items.properties, true)
                    } else if (itemType === 'array') {
                        arrayItem = processArray(value, oneOf ? {} : output.items.properties, true)
                    } else {
                        arrayItem = {}
                        arrayItem.type = itemType
                        if (itemFormat) {
                            arrayItem.format = itemFormat
                        }
                    }
                    if (oneOf) {
                        var childType = Type.string(value).toLowerCase()
                        var tempObj = {}
                        if (!arrayItem.type && childType === 'object') {
                            tempObj.properties = arrayItem
                            tempObj.type = 'object'
                            arrayItem = tempObj
                        }
                        output.items.oneOf.push(arrayItem)
                    } else {
                        if (output.items.type !== 'object') {
                            continue;
                        }
                        output.items.properties = arrayItem
                    }
                }
            }
            return nested ? output.items : output
        }

        function processObject(object, output, nested) {
            if (nested && output) {
                output = { properties: output }
            } else {
                output = output || {}
                output.type = getPropertyType(object)
                output.properties = output.properties || {}
            }

            for (var key in object) {
                var value = object[key]
                var type = getPropertyType(value)
                var format = getPropertyFormat(value)

                type = type === 'undefined' ? 'null' : type

                if (type === 'object') {
                    output.properties[key] = processObject(value, output.properties[key])
                    continue
                }

                if (type === 'array') {
                    output.properties[key] = processArray(value, output.properties[key])
                    continue
                }

                if (output.properties[key]) {
                    var entry = output.properties[key]
                    var hasTypeArray = Array.isArray(entry.type)

                    // When an array already exists, we check the existing
                    // type array to see if it contains our current property
                    // type, if not, we add it to the array and continue
                    if (hasTypeArray && entry.type.indexOf(type) < 0) {
                        entry.type.push(type)
                    }

                    // When multiple fields of differing types occur,
                    // json schema states that the field must specify the
                    // primitive types the field allows in array format.
                    if (!hasTypeArray && entry.type !== type) {
                        entry.type = [entry.type, type]
                    }

                    continue
                }

                output.properties[key] = {}
                output.properties[key].type = type

                if (format) {
                    output.properties[key].format = format
                }
            }

            return nested ? output.properties : output
        }

        function getPropertyFormat(value) {
            var type = Type.string(value).toLowerCase()

            if (type === 'date') return 'date-time'

            return null
        }

        return function Process(title, object) {
            var processOutput
            var output = {
                $id: DRAFT,
                $schema: DRAFT
            }

            // Determine title exists
            if (typeof title !== 'string') {
                object = title
                title = undefined
            } else {
                output.title = title
            }

            // Set initial object type
            output.type = Type.string(object).toLowerCase()

            // Process object
            if (output.type === 'object') {
                processOutput = processObject(object)
                output.type = processOutput.type
                output.properties = processOutput.properties
            }

            if (output.type === 'array') {
                processOutput = processArray(object)
                output.type = processOutput.type
                output.items = processOutput.items

                if (output.title) {
                    output.items.title = output.title
                    output.title += ' Set'
                }
            }

            // Output
            return output
        }
    }());

// Chai plugin to assert if given object is subset of target object
function chaiSubset(chai, utils) {
    var Assertion = chai.Assertion;
    var assertionPrototype = Assertion.prototype;

    Assertion.addMethod('containSubset', function (expected) {
        var actual = utils.flag(this, 'object');
        var showDiff = chai.config.showDiff;

        assertionPrototype.assert.call(this,
            compare(expected, actual),
            'expected #{act} to contain subset #{exp}',
            'expected #{act} to not contain subset #{exp}',
            expected,
            actual,
            showDiff
        );
    });

    chai.assert.containSubset = function (val, exp, msg) {
        new chai.Assertion(val, msg).to.be.containSubset(exp);
    };

    function compare(expected, actual) {
        if (expected === actual) {
            return true;
        }
        if (typeof (actual) !== typeof (expected)) {
            return false;
        }
        if (typeof (expected) !== 'object' || expected === null) {
            return expected === actual;
        }
        if (!!expected && !actual) {
            return false;
        }

        if (Array.isArray(expected)) {
            if (typeof (actual.length) !== 'number') {
                return false;
            }
            var aa = Array.prototype.slice.call(actual);
            return expected.every(function (exp) {
                return aa.some(function (act) {
                    return compare(exp, act);
                });
            });
        }

        if (expected instanceof Date) {
            if (actual instanceof Date) {
                return expected.getTime() === actual.getTime();
            } else {
                return false;
            }
        }

        return Object.keys(expected).every(function (key) {
            var eo = expected[key];
            var ao = actual[key];
            if (typeof (eo) === 'object' && eo !== null && ao !== null) {
                return compare(eo, ao);
            }
            if (typeof (eo) === 'function') {
                return eo(ao);
            }
            return ao === eo;
        });
    }
}

chai.use(chaiSubset);

// Creating the URL for mock server from where we need to fetch this request from.
let snapshotURL = pm.variables.get('snapshotURL'),
    path = pm.request.url.path.join('/');
if (pm.request.url.query.count()) {
    let params = pm.request.url.query.map((q) => {
        return `${q.key}=${q.value}`;
    })
    path = `${path}?${params.join('&')}`;
}

let snapshotFetchOptions = {
    url: `${snapshotURL}/${path}`,
    method: pm.request.method
};

// Fetch Snapshot as mock response;
pm.sendRequest(snapshotFetchOptions, function (err, res) {
    let snapshotResponse = res.json();
    console.log("lalalalal", snapshotResponse);
    console.log("lalalalal", pm.response.json());
    if (err || snapshotResponse.error) {
        return;
    }

    // Strategy 1
    pm.test.skip(`${pm.info.requestName} response should match its saved Snapshot`, () => {
        pm.expect(pm.response.json()).to.eql(snapshotResponse);
    })

    // Strategy 2
    pm.test.skip(`${pm.info.requestName} response should have Snapshot as its subset`, () => {
        pm.expect(pm.response.json()).to.containSubset(snapshotResponse);
    })

    // Strategy 3
    pm.test(`${pm.info.requestName} response should match the JSON Schema generated from saved Snapshot`, () => {
        let schema = generateSchema('Snapshot schema', snapshotResponse);
        pm.expect(ajv.validate(schema, pm.response.json())).to.be.true;
    })

});