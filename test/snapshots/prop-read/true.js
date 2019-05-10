const foo = {
    get bar() {
        return "bar";
    }
};

const illegalAccess = foo.quux.tooDeep;
