const { PROJECT_TYPES } = require('./consts');
const { CrawleeAnalyzer } = require('./projects/CrawleeAnalyzer');
const { OldApifySDKAnalyzer } = require('./projects/OldApifySDKAnalyzer');
const { ScrapyProjectAnalyzer } = require('./scrapy-wrapper/ScrapyProjectAnalyzer');

const analyzers = [
    {
        type: PROJECT_TYPES.SCRAPY,
        analyzer: ScrapyProjectAnalyzer,
    },
    {
        type: PROJECT_TYPES.CRAWLEE,
        analyzer: CrawleeAnalyzer,
    },
    {
        type: PROJECT_TYPES.PRE_CRAWLEE_APIFY_SDK,
        analyzer: OldApifySDKAnalyzer,
    },
];

class ProjectAnalyzer {
    static getProjectType(pathname) {
        const analyzer = analyzers.find((a) => {
            if (!a.analyzer.isApplicable) {
                throw new Error(`Analyzer ${a.analyzer} does not have isApplicable method.`);
            }

            return a.analyzer.isApplicable(pathname);
        });

        return analyzer?.type || PROJECT_TYPES.UNKNOWN;
    }
}

module.exports = { ProjectAnalyzer };
