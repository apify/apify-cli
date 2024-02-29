export class Spider {
    name?: string;
    class_name: string;
    start_urls?: string;
    pathname: string;

    constructor(data: SpiderData) {
        this.name = data.name;
        this.class_name = data.class_name;
        this.start_urls = data.start_urls;
        this.pathname = data.pathname;
    }
}

export interface SpiderData {
    name?: string;
    class_name: string;
    start_urls?: string;
    pathname: string;
}
