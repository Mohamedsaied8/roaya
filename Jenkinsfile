pipeline {
    agent any
    
    options {
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    environment {
        BACKEND_BUILD_DIR = "backend/build"
    }

    stages {
        stage('Initialize') {
            steps {
                script {
                    // 1. Try modern Checks API (if GitHub App is configured)
                    try {
                        publishChecks(
                            name: 'Jenkins/Build',
                            status: 'IN_PROGRESS',
                            title: 'Build Started',
                            summary: 'Wait for build and tests to complete...'
                        )
                    } catch (Exception e) {
                        echo "Checks API failed: ${e.message}"
                    }

                    // 2. Try Pull Request specific status (if PR Builder plugin is used)
                    try {
                        if (env.CHANGE_ID) {
                            setGitHubPullRequestStatus(
                                context: 'Jenkins/Build',
                                message: 'Build is in progress...',
                                state: 'pending'
                            )
                        }
                    } catch (Exception e) {
                        echo "PR Status set failed: ${e.message}"
                    }

                    // 3. Fallback to Traditional Status (Status icon)
                    try {
                        step([$class: 'GitHubCommitStatusSetter',
                            contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: 'Jenkins/Build'],
                            errorHandlers: [[$class: 'ShallowAnyErrorHandler']],
                            reposSource: [$class: 'AnyRepoSource'],
                            statusBackfillSource: [$class: 'DiscreteStatusBackfillSource'],
                            statusResultSource: [
                                $class: 'ConditionalStatusResultSource',
                                results: [[$class: 'AnyBuildResult', message: 'Build is in progress...', state: 'PENDING']]
                            ]
                        ])
                    } catch (Exception e) {
                        echo "Traditional Status notification failed: ${e.message}"
                    }
                }
            }
        }

        stage('Build') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            sh 'mkdir -p build && cd build && cmake -DCMAKE_BUILD_TYPE=Release .. && nproc && make -j$(nproc)'
                        }
                    }
                }
                stage('Frontend') {
                    agent {
                        docker {
                            image 'node:20-bullseye-slim'
                            reuseNode true
                        }
                    }
                    steps {
                        dir('frontend') {
                            sh 'npm ci --prefer-offline --no-audit'
                            sh 'npm run build'
                        }
                    }
                }
            }
        }

        stage('Unit Testing') {
            parallel {
                stage('Backend GoogleTests') {
                    steps {
                        dir('backend/build') {
                            sh './bin/unit_tests'
                        }
                    }
                }
                stage('Frontend Vitest') {
                    agent {
                        docker {
                            image 'node:20-bullseye-slim'
                            reuseNode true
                        }
                    }
                    steps {
                        dir('frontend') {
                            sh 'npm test'
                        }
                    }
                }
            }
        }

        stage('Integration Testing') {
            steps {
                echo 'Running integration tests...'
                // Add integration tests once environment is ready
            }
        }

        stage('Acceptance Testing') {
            steps {
                echo 'Running E2E tests via Playwright...'
                // Add Playwright tests here
            }
        }
    }

    post {
        success {
            script {
                try {
                    publishChecks(
                        name: 'Jenkins/Build',
                        status: 'COMPLETED',
                        conclusion: 'SUCCESS',
                        title: 'All Tests Passed',
                        summary: 'Pipeline finished successfully.'
                    )
                } catch (Exception e) {}

                try {
                    if (env.CHANGE_ID) {
                        setGitHubPullRequestStatus(
                            context: 'Jenkins/Build',
                            message: 'All tests passed!',
                            state: 'success'
                        )
                    }
                } catch (Exception e) {}

                try {
                    step([$class: 'GitHubCommitStatusSetter',
                        contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: 'Jenkins/Build'],
                        errorHandlers: [[$class: 'ShallowAnyErrorHandler']],
                        reposSource: [$class: 'AnyRepoSource'],
                        statusBackfillSource: [$class: 'DiscreteStatusBackfillSource'],
                        statusResultSource: [
                            $class: 'ConditionalStatusResultSource',
                            results: [[$class: 'AnyBuildResult', message: 'All tests passed!', state: 'SUCCESS']]
                        ]
                    ])
                } catch (Exception e) {}
            }
        }
        failure {
            script {
                try {
                    publishChecks(
                        name: 'Jenkins/Build',
                        status: 'COMPLETED',
                        conclusion: 'FAILURE',
                        title: 'Build Failed',
                        summary: 'Check Jenkins logs for details.'
                    )
                } catch (Exception e) {}

                try {
                    if (env.CHANGE_ID) {
                        setGitHubPullRequestStatus(
                            context: 'Jenkins/Build',
                            message: 'Build failed, check logs.',
                            state: 'failure'
                        )
                    }
                } catch (Exception e) {}

                try {
                    step([$class: 'GitHubCommitStatusSetter',
                        contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: 'Jenkins/Build'],
                        errorHandlers: [[$class: 'ShallowAnyErrorHandler']],
                        reposSource: [$class: 'AnyRepoSource'],
                        statusBackfillSource: [$class: 'DiscreteStatusBackfillSource'],
                        statusResultSource: [
                            $class: 'ConditionalStatusResultSource',
                            results: [[$class: 'AnyBuildResult', message: 'Build failed, check logs.', state: 'FAILURE']]
                        ]
                    ])
                } catch (Exception e) {}
            }
        }
        always {
            cleanWs()
            echo 'Pipeline finished.'
        }
    }
}
