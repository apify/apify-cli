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
                                Apify command-line interface (Apify CLI)
                            </h1>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col">
                            <h2></h2>
                            <h2>
                                Apify command-line interface (Apify CLI) helps you create, develop, build and
                                run <a href="https://www.apify.com/actors">Apify actors</a>, and manage the Apify
                                cloud platform from any computer.
                            </h2>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col">
                            <div className={styles.heroButtons}>
                                <Link to="docs/guides/apify-platform" className={styles.getStarted}>Get Started</Link>
                                <iframe src="https://ghbtns.com/github-btn.html?user=apify&repo=apify-sdk-js&type=star&count=true&size=large" frameBorder="0" scrolling="0" width="170" height="30" title="GitHub"></iframe>
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
            title={`${siteConfig.title} · ${siteConfig.tagline}`}
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
                            While you can develop actors in an online IDE directly in the Apify web application, for complex projects
                            it is more convenient to develop actors locally on your computer using Apify SDK and only push the actors
                            to the Apify cloud during deployment. This is where the Apify CLI comes in and allows you to quickly develop
                            locally and then deploy to the cloud with a single command.
                            </p>
                        </div>
                        <div className="col col--6">
                            <CodeBlock language='bash'>{`# Install Apify CLI
npm i -g apify-cli

# Create your first actor
apify create my-actor

# Run it locally
apify run

# Log into your Apify account and deploy it to Apify Platform
apify login
apify push`}</CodeBlock>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
