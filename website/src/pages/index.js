import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './index.module.css';

function Hero() {
    return (
        <header className={clsx('container', styles.heroBanner)}>
            <div className="row padding-horiz--md">
                <div className="col col--7">
                    <div className={clsx(styles.relative, 'row')}>
                        <div className="col">
                            <h1 className={styles.tagline}>
                                Apify command-line interface (CLI)
                            </h1>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col">
                            <h2></h2>
                            <h2>
                                Create, develop, build, and run <a href="https://docs.apify.com/actors">Apify Actors</a> from
                                your terminal. Manage the Apify platform from shell scripts.
                            </h2>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col">
                            <div className={styles.heroButtons}>
                                <Link to="docs" className={styles.getStarted}>Learn more</Link>
                                <iframe src="https://ghbtns.com/github-btn.html?user=apify&repo=apify-cli&type=star&count=true&size=large" frameBorder="0" scrolling="0" width="170" height="30" title="GitHub"></iframe>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={clsx(styles.relative, 'col', 'col--5')}>
                    <div className={styles.logoBlur}>
                        <img src={require('/img/logo-blur.png').default} className={clsx(styles.hideSmall)} />
                    </div>
                    <div className={styles.codeBlock}>
                        <CodeBlock className="language-bash">
                            npx apify-cli create
                        </CodeBlock>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default function Home() {
    const { siteConfig } = useDocusaurusContext();
    return (
        <Layout
            description={siteConfig.description}>
            <Hero />
            <div>
                <div className="container">
                    <div className="row padding-horiz--md" >
                        <div className="col col--6">
                            <p style={{ lineHeight: '200%' }}>
                            Apify actors are cloud programs that can perform arbitrary web scraping,
                            automation, or data processing job. They accept input, perform their job and generate output.
                            </p>
                            <p style={{ lineHeight: '200%' }}>
                            While you can develop actors in an online IDE in <a href="https://console.apify.com/">Apify Console</a>, for
                            larger projects, it is more convenient to develop actors locally on your computer
                            using <a href="https://docs.apify.com/sdk/js/">Apify SDK</a> and only push the actors
                            to the Apify platform during deployment. This is where the Apify CLI comes in to allow you to quickly develop
                            locally and then deploy to the cloud with a single command.
                            </p>
                        </div>
                        <div className="col col--6">
                            <CodeBlock language='bash'>{`# Create your first actor
npx apify-cli create my-actor

# Go into the project directory
cd my-actor

# Run it locally
npx apify-cli run

# Log into your Apify account and deploy it to Apify Platform
npx apify-cli login
npx apify-cli push`}</CodeBlock>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
