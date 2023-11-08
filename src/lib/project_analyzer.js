const { PROJECT_TYPES } = require('./consts');
const { ScrapyProjectAnalyzer } = require('./scrapy-wrapper/src/ScrapyProjectAnalyzer');

const analyzers = [
    {
        type: PROJECT_TYPES.SCRAPY,
        analyzer: ScrapyProjectAnalyzer,
    },
];

class ProjectAnalyzer {
    static getProjectType(pathname) {
        const analyzer = analyzers.find((a) => {
            if (!a.analyzer.isApplicable) throw new Error(`Analyzer ${a.analyzer} does not have isApplicable method.`);
            return a.analyzer.isApplicable(pathname);
        });
        return analyzer?.type || PROJECT_TYPES.UNKNOWN;
    }
}

module.exports = { ProjectAnalyzer };
