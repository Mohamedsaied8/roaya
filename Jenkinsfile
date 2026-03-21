pipeline {
    agent any
    
    options {
        cleanWs()
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    environment {
        // Paths for build
        BACKEND_BUILD_DIR = "backend/build"
    }

    stages {
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
                            // Ensure dependencies are present for testing
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
                // Placeholder for future docker-compose based integration tests
            }
        }

        stage('Acceptance Testing') {
            steps {
                echo "Running E2E tests via Playwright..."
                // Placeholder for Playwright tests
            }
        }
    }

    post {
        success {
            echo "Pipeline succeeded. Updating GitHub status..."
            step([$class: 'GitHubCommitStatusSetter', statusResultSource: [$class: 'ConditionalStatusResultSource', results: [[$class: 'AnyBuildResult', message: 'Build finished successfully', state: 'SUCCESS']]]])
        }
        failure {
            echo "Pipeline failed. Updating GitHub status..."
            step([$class: 'GitHubCommitStatusSetter', statusResultSource: [$class: 'ConditionalStatusResultSource', results: [[$class: 'AnyBuildResult', message: 'Build failed', state: 'FAILURE']]]])
        }
        always {
            echo "Pipeline finished."
        }
    }
}
