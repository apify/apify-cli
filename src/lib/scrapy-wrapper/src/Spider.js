class Spider {
    name = null;
    class_name = null;
    start_urls = null;
    pathname = null;

    constructor(data) {
        this.name = data.name;
        this.class_name = data.class_name;
        this.start_urls = data.start_urls;
        this.pathname = data.pathname;
    }
}

module.exports = { Spider };