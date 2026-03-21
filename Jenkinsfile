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
                githubNotify context: 'Jenkins/Build', status: 'PENDING', description: 'Build is in progress...'
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
            githubNotify context: 'Jenkins/Build', status: 'SUCCESS', description: 'All tests passed!'
        }
        failure {
            githubNotify context: 'Jenkins/Build', status: 'FAILURE', description: 'Build failed, check logs.'
        }
        always {
            cleanWs()
            echo "Pipeline finished."
        }
    }
}
