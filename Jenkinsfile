pipeline {
    agent any
    
    options {
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    environment {
        BACKEND_BUILD_DIR = "backend/build"
        // Replace with your GitHub owner/repo
        REPO_NAME = "Mohamedsaied8/roaya"
    }

    stages {
        stage('Initialize') {
            steps {
                script {
                    // Try to notify GitHub that the build has started
                    notifyGitHub('pending', 'Build Started', 'Wait for build and tests to complete...')
                    
                    // Standard plugin attempts (in case they start working)
                    try { publishChecks(name: 'Jenkins/Build', status: 'IN_PROGRESS', title: 'Build Started') } catch (e) {}
                    try { if (env.CHANGE_ID) { setGitHubPullRequestStatus(context: 'Jenkins/Build', message: 'Building...', state: 'pending') } } catch (e) {}
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
    }

    post {
        success {
            script {
                notifyGitHub('success', 'Passed', 'All tests completed successfully.')
            }
        }
        failure {
            script {
                notifyGitHub('failure', 'Failed', 'Build or tests failed. Check Jenkins logs.')
            }
        }
        always {
            cleanWs()
            echo 'Pipeline finished.'
        }
    }
}

// Helper function to notify GitHub via API directly (very robust)
def notifyGitHub(state, title, summary) {
    try {
        // Fallback 1: GitHubCommitStatusSetter (Status Icon)
        step([$class: 'GitHubCommitStatusSetter',
            contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: 'Jenkins/Build'],
            reposSource: [$class: 'AnyRepoSource'],
            statusResultSource: [$class: 'ConditionalStatusResultSource', results: [[$class: 'AnyBuildResult', message: summary, state: state.toUpperCase()]]]
        ])
    } catch (e) {
        echo "Plugin notification failed: ${e.message}. Trying direct API..."
        
        // Fallback 2: Direct API call via curl if a github_token_id credential exists
        try {
            withCredentials([string(credentialsId: 'github_token_id', variable: 'TOKEN')]) {
                sh """
                    curl -X POST -H "Authorization: token ${TOKEN}" \
                         -H "Accept: application/vnd.github.v3+json" \
                         https://api.github.com/repos/${env.REPO_NAME}/statuses/${env.GIT_COMMIT} \
                         -d '{"state": "${state}", "target_url": "${env.BUILD_URL}", "description": "${summary}", "context": "Jenkins/Build"}'
                """
            }
        } catch (err) {
            echo "Direct API notification failed: ${err.message}. Please ensure a Secret Text credential 'GITHUB_TOKEN' exists."
        }
    }
}
