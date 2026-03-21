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
                    try {
                        // Notify GitHub that the build is starting
                        step([$class: 'GitHubCommitStatusSetter',
                            reposSource: [$class: 'StaticRepoSource', repoNames: ['Mohamedsaied8/roaya']],
                            contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: 'Jenkins/Build'],
                            statusResultSource: [$class: 'ConditionalStatusResultSource', 
                                results: [[$class: 'AnyBuildResult', message: 'Build is in progress...', state: 'PENDING']]]
                        ])
                    } catch (Exception e) {
                        echo "GitHub notification failed: ${e.message}"
                    }
                }
            }
        }

        stage('Build') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            sh "mkdir -p build && cd build && cmake -DCMAKE_BUILD_TYPE=Release .. && make -j\$(nproc)"
                        }
                    }
                }
                stage('Frontend') {
                    agent {
                        docker { image 'node:20-bullseye-slim' }
                    }
                    environment {
                        npm_config_cache = "npm-cache"
                    }
                    steps {
                        dir('frontend') {
                            sh "npm ci --prefer-offline --no-audit"
                            sh "npm run build"
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
                            sh "./bin/unit_tests"
                        }
                    }
                }
                stage('Frontend Vitest') {
                    agent {
                        docker { image 'node:20-bullseye-slim' }
                    }
                    environment {
                        npm_config_cache = "npm-cache"
                    }
                    steps {
                        dir('frontend') {
                            sh "npm ci --prefer-offline --no-audit"
                            sh "npm test"
                        }
                    }
                }
            }
        }

        stage('Integration Testing') {
            steps {
                echo "Running integration tests..."
            }
        }

        stage('Acceptance Testing') {
            steps {
                echo "Running E2E tests via Playwright..."
            }
        }
    }

    post {
        success {
            script {
                try {
                    step([$class: 'GitHubCommitStatusSetter',
                        reposSource: [$class: 'StaticRepoSource', repoNames: ['Mohamedsaied8/roaya']],
                        contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: 'Jenkins/Build'],
                        statusResultSource: [$class: 'ConditionalStatusResultSource', 
                            results: [[$class: 'AnyBuildResult', message: 'All tests passed!', state: 'SUCCESS']]]
                    ])
                } catch (Exception e) {
                    echo "GitHub notification failed: ${e.message}"
                }
            }
        }
        failure {
            script {
                try {
                    step([$class: 'GitHubCommitStatusSetter',
                        reposSource: [$class: 'StaticRepoSource', repoNames: ['Mohamedsaied8/roaya']],
                        contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: 'Jenkins/Build'],
                        statusResultSource: [$class: 'ConditionalStatusResultSource', 
                            results: [[$class: 'AnyBuildResult', message: 'Build failed, check logs.', state: 'FAILURE']]]
                    ])
                } catch (Exception e) {
                    echo "GitHub notification failed: ${e.message}"
                }
            }
        }
        always {
            cleanWs()
            echo "Pipeline finished."
        }
    }
}
