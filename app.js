$.url_param = function(name, url) {
    var uri = url || window.location.href,
        results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(uri);
    if (!results) return null;
    return results[1] || null;
};

$.local_date = function (value) {
    if (value === undefined || value === null) return '';
    if (value.length === 0) return '';
    if (typeof value !== 'string') return '';

    var d = new Date(value);

    return [
        d.getFullYear(),
        "0".concat(d.getMonth() + 1).slice(-2),
        "0".concat(d.getDate()).slice(-2)
    ].join('-');
};

Vue.filter('local_date', $.local_date);

let oldest = new Date();
oldest.setDate(oldest.getDate() - 30);

let recent = new Date();
recent.setDate(recent.getDate() - 3);

new Vue({
    el: '#vue-application',
    data: {
        oldest: oldest,
        recent: recent,

        github_base_url: 'https://api.github.com',
        enterprise_base_url: '',
        github_token: '',

        gh: null,
        ghe: null,
        default_max: 6,
        max_pr_history: 4,

        github_repos: [],
        enterprise_repos: [],

        milestones: [],
        projects: [],
        pullrequests: {
            open: {
                visible: true,
                pullrequests: [],
            },
            closed: {
                visible: true,
                pullrequests: []
            },
        },
        reviews: {}
    },
    created: function() {
        let enterprise_url = store.get('enterprise_url');
        let enterprise_repos = store.get('enterprise_repos');
        let github_repos = store.get('github_repos');
        let github_token = store.get('github_token');

        if (enterprise_url) {
            this.enterprise_base_url = enterprise_url;
        }

        if (enterprise_repos) {
            this.enterprise_repos = enterprise_repos;
        }

        if (github_repos) {
            this.github_repos = github_repos;
        }

        if (github_token) {
            this.github_token = github_token;
        }

        let max_gh = (this.github_repos.length > this.default_max) ? this.github_repos.length : this.default_max;
        let max_ghe = (this.enterprise_repos.length > this.default_max) ? this.enterprise_repos.length : this.default_max;
        this.populateDefaultRepos(max_gh, max_ghe);
    },

    methods: {
        populateDefaultRepos: function(max_gh, max_ghe) {
            for (let i = 0; i < max_gh; i++) {
                if (!this.github_repos[i]) {
                    this.github_repos[i] = {url: '', visible: true, owner: '', repo: ''};
                } else {
                    if (!this.github_repos[i].hasOwnProperty('url')) this.github_repos[i].url = '';
                    if (!this.github_repos[i].hasOwnProperty('visible')) this.github_repos[i].visible = true;
                    if (!this.github_repos[i].hasOwnProperty('owner')) this.github_repos[i].owner = '';
                    if (!this.github_repos[i].hasOwnProperty('repo')) this.github_repos[i].repo = '';
                }
            }

            for (let i = 0; i < max_ghe; i++) {
                if (!this.enterprise_repos[i]) {
                    this.enterprise_repos[i] = {url: '', visible: true, owner: '', repo: ''};
                } else {
                    if (!this.enterprise_repos[i].hasOwnProperty('url')) this.enterprise_repos[i].url = '';
                    if (!this.enterprise_repos[i].hasOwnProperty('visible')) this.enterprise_repos[i].visible = true;
                    if (!this.enterprise_repos[i].hasOwnProperty('owner')) this.enterprise_repos[i].owner = '';
                    if (!this.enterprise_repos[i].hasOwnProperty('repo')) this.enterprise_repos[i].repo = '';
                }
            }
        },

        load: function() {
            store.set('enterprise_url', this.enterprise_base_url);
            store.set('enterprise_repos', this.enterprise_repos);

            store.set('github_token', this.github_token);
            store.set('github_repos', this.github_repos);

            this.gh = new GitHub({token: this.github_token}, this.github_base_url);
            this.ghe = new GitHub({/*token: 'MY_OAUTH_TOKEN'*/}, this.enterprise_base_url);

            for (i in this.github_repos) {
                if (this.github_repos[i].url.length == 0) {
                    this.github_repos[i].owner = '';
                    this.github_repos[i].repo = '';
                    continue;
                }

                let [owner, repo] = this.github_repos[i].url.split(/\//);
                this.github_repos[i].owner = owner;
                this.github_repos[i].repo = repo;
            }

            for (i in this.enterprise_repos) {
                if (this.enterprise_repos[i].url.length == 0) {
                    this.enterprise_repos[i].owner = '';
                    this.enterprise_repos[i].repo = '';
                    continue;
                }

                let [owner, repo] = this.enterprise_repos[i].url.split(/\//);
                this.enterprise_repos[i].owner = owner;
                this.enterprise_repos[i].repo = repo;
            }

        },
        loadProjects: function() {
            this.load();

            this.projects = [];
            let project_promises = [];

            // Grab github.com repos
            for (meta of this.github_repos) {
                if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                let ghRepo = this.gh.getRepo(meta.owner, meta.repo);
                project_promises.push(ghRepo.listProjects());
            }

            // Grab github enterprise repos
            if (this.enterprise_base_url) {
                for (meta of this.enterprise_repos) {
                    if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                    let ghRepo = this.ghe.getRepo(meta.owner, meta.repo);
                    project_promises.push(ghRepo.listProjects());
                }
            }

            // Resolve promises
            this.resolveProjects(project_promises);
        },
        loadMilestones: function() {
            this.load();

            this.milestones = [];
            let milestone_promises = [];

            // Grab github.com repos
            for (meta of this.github_repos) {
                if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                let ghIssues = this.gh.getIssues(meta.owner, meta.repo);
                milestone_promises.push(ghIssues.listMilestones({state: 'all'}));
            }

            // Grab github enterprise repos
            if (this.enterprise_base_url) {
                for (meta of this.enterprise_repos) {
                    if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                    let ghIssues = this.ghe.getIssues(meta.owner, meta.repo);
                    milestone_promises.push(ghIssues.listMilestones({state: 'all'}));
                }
            }

            // Resolve promises
            this.resolveMilestones(milestone_promises);
        },
        loadPullRequests: function() {
            this.load();

            this.pullrequests = {
                open: {
                    visible: true,
                    pullrequests: []
                },
                closed: {
                    visible: true,
                    pullrequests: []
                },
            };
            this.reviews = {};

            let open_promises = [];
            let closed_promises = [];

            // Grab github.com repos
            for (meta of this.github_repos) {
                if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                let gh_repo = this.gh.getRepo(meta.owner, meta.repo);

                let open = gh_repo.listPullRequests({state: 'open'})
                    .then(this.resolvePRDetails(gh_repo));
                let closed = gh_repo.listPullRequests({state: 'closed', 'sort': 'created', 'direction': 'desc'})
                    .then(this.resolvePRDetails(gh_repo, this.max_pr_history));

                open_promises.push(open);
                closed_promises.push(closed);
            }

            // Grab github enterprise repos
            if (this.enterprise_base_url) {
                for (meta of this.enterprise_repos) {
                    if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                    let ghe_repo = this.ghe.getRepo(meta.owner, meta.repo);

                    let open = ghe_repo.listPullRequests({state: 'open'})
                        .then(this.resolvePRDetails(ghe_repo));
                    let closed = ghe_repo.listPullRequests({state: 'closed', 'sort': 'created', 'direction': 'desc'})
                        .then(this.resolvePRDetails(ghe_repo, this.max_pr_history));

                    open_promises.push(open);
                    closed_promises.push(closed);
                }
            }

            // Resolve promises
            this.resolvePullRequests(open_promises, 'open');
            this.resolvePullRequests(closed_promises, 'closed');
        },

        resolveProjects: function(promises) {
            let self = this;

            Promise.all(promises)
            .then((responses) => {
                responses.forEach((response) => {
                    let projects = response.data
                    if (!Array.isArray(response.data)) {
                        projects = [projects];
                    }

                    for (let p of projects) {
                        meta = self.findMeta(p.url);
                        self.addProject(meta, p);
                    }
                });
            });
        },
        resolveMilestones: function(promises) {
            let self = this;

            Promise.all(promises)
            .then((responses) => {
                responses.forEach((response) => {
                    let milestones = response.data
                    if (!Array.isArray(response.data)) {
                        milestones = [milestones];
                    }

                    for (let m of milestones) {
                        meta = self.findMeta(m.url);
                        self.addMilestone(meta, m);
                    }
                });

                self.milestones = self.milestones.sort((a, b) => {
                    let aDue = new Date(a.m.due_on).getTime();
                    let bDue = new Date(b.m.due_on).getTime();

                    if (aDue < bDue) return -1;
                    if (aDue > bDue) return 1;
                    return 0;
                });
            });
        },
        resolvePullRequests: function(promises, type) {
            let self = this;

            Promise.all(promises)
            .then((responses) => {
                responses.forEach((responses) => {
                    for (let r of responses) {
                        let data = r.data;
                        if (data.url === undefined) {
                            // is a review
                            self.addPullRequestReviews(type, r.pr_url, r.data);
                        } else {
                            // is a pr
                            self.addPullRequest(type, data);
                        }
                    }
                });

                self.pullrequests[type].pullrequests = self.pullrequests[type].pullrequests.sort((a, b) => {
                    let aUpdated = new Date(a.pr.updated_at).getTime();
                    let bUpdated = new Date(b.pr.updated_at).getTime();

                    if (aUpdated < bUpdated) return 1;
                    if (aUpdated > bUpdated) return -1;
                    return 0;
                });
            });
        },
        resolvePRDetails: function(client, limit) {
            let self = this;

            limit = limit || 50;
            return (r) => {
                let promises = [];
                let current = 0;

                if (r.data.length) {
                    for (pr of r.data) {
                        current++;
                        promises.push(client.getPullRequest(pr.number));

                        let pr_url = pr.url;
                        let reviews = client.
                            _request('GET', `/repos/${client.__fullname}/pulls/${pr.number}/reviews`)
                            .then((v) => {
                                return {
                                    pr_url: pr_url,
                                    data: v.data
                                };
                            });

                        promises.push(reviews);

                        if (current > limit) break;
                    }
                }

                return Promise.all(promises);
            };
        },

        addProject: function(meta, project) {
            meta = this.findMeta(project.url);
            if (!meta) return;

            var p = this.buildProject(meta, project);

            this.projects = this.projects.concat(p);
        },
        addMilestone: function(meta, milestone) {
            meta = this.findMeta(milestone.url);
            if (!meta) return;

            // let milestoneTime = new Date(milestone.due_on).getTime();
            // if (this.oldest.getTime() > milestoneTime) return;

            let self = this;

            // Get issues
            let ghClient = (this.isGH(milestone.url)) ? this.gh : this.ghe;
            let m = this.buildMilestone(meta, milestone);

            ghClient
                .getIssues(meta.owner, meta.repo)
                .listIssues({
                    milestone: milestone.number,
                    state: 'all',
                    sort: 'updated',
                    direction: 'desc'
                }).then(function(response) {
                    m.issues = response.data;
                });

            this.milestones = this.milestones.concat(m);
        },
        addPullRequest: function(type, pr) {
            meta = this.findMeta(pr.url);
            if (!meta) return;

            let username = pr.user.login.toLowerCase();;

            if (!this.reviews[username]) {
                this.reviews[username] = this.buildReview(pr.user);
            }
            if (!this.reviews[username].submitted.includes(pr.url)) {
            console.log(username +': '+ pr.url);
                this.reviews[username].submitted.push(pr.url);
            }

            // let prTime = new Date(pr.updated_at).getTime();
            // if (this.oldest.getTime() > prTime) return;

            var p = this.buildPR(meta, pr);
            this.pullrequests[type].pullrequests.push(p);
        },
        addPullRequestReviews: function(type, pr_url, reviews) {
            if (reviews.length === 0) {
                return;
            }

            for (pr of this.pullrequests[type].pullrequests) {
                if (pr_url == pr.pr.url) {
                    pr.reviews = reviews;
                    this.appendReviewsMetadata(pr.pr, reviews);
                    break;
                }
            }
        },
        appendReviewsMetadata: function(pr, reviews) {
            let pr_username = pr.user.login.toLowerCase();

            for (review of reviews) {
                let username = review.user.login.toLowerCase();

                if (!this.reviews[username]) {
                    this.reviews[username] = this.buildReview(review.user);
                }

                // Dont record review stats if its users own pr
                if (pr_username == username) {
                    continue;
                }

                if (!this.reviews[username].reviewed.includes(review.pull_request_url)) {
                    this.reviews[username].reviewed.push(review.pull_request_url);
                }

                if (review.state === 'APPROVED') {
                    this.reviews[username].approved.push(review.body);

                } else if (review.state === 'CHANGES_REQUESTED') {
                    this.reviews[username].changes_requested.push(review.body);

                } else if (review.state === 'COMMENTED') {
                    this.reviews[username].commented.push(review.pull_request_url);
                }
            }
        },

        buildProject: function(meta, project) {
            return {
                owner: meta ? meta.owner : null,
                repo: meta ? meta.repo : null,
                p: project,
                cards: [],
                visible: true
            };
        },
        buildMilestone: function(meta, milestone) {
            return {
                owner: meta ? meta.owner : null,
                repo: meta ? meta.repo : null,
                m: milestone,
                issues: [],
                visible: true
            };
        },
        buildPR: function(meta, pr) {
            return {
                owner: meta ? meta.owner : null,
                repo: meta ? meta.repo : null,
                pr: pr,
                reviews: []
            };
        },
        buildReview: function(user) {
            return {
                user: user,
                submitted: [],
                reviewed: [],

                approved: [],
                changes_requested: [],
                commented: []
            };
        },

        isGH: function(url) {
            return url.includes(this.github_base_url);
        },

        findMeta: function(url) {
            if (this.isGH(url)) {
                for (i in this.github_repos) {
                    if (this.github_repos[i].url.length === 0) continue;

                    if (url.includes(this.github_repos[i].url)) {
                        return this.github_repos[i];
                    }
                }

                return null;
            } else {
                for (i in this.enterprise_repos) {
                    if (this.enterprise_repos[i].url.length === 0) continue;

                    if (url.includes(this.enterprise_repos[i].url)) {
                        return this.enterprise_repos[i];
                    }
                }

                return null;
            }
        },

        // Used from templates
        isNothingLoaded: function() {
            return (
                this.milestones.length === 0 &&
                this.projects.length === 0 &&
                this.pullrequests.open.pullrequests.length === 0 &&
                this.pullrequests.closed.pullrequests.length === 0
            );
        },
        hasAnyPullRequests: function() {
            return (
                this.pullrequests.open.pullrequests.length > 0 ||
                this.pullrequests.closed.pullrequests.length > 0
            );
        },

        isRecent: function(d) {
            let dTime = new Date(d);
            return (this.recent.getTime() < dTime.getTime());
        },

        activityColor: function(length) {
            if (length > 8) {
                return 'green';
            }

            if (length > 4) {
                return 'orange';
            }

            if (length > 0) {
                return 'red';
            }

            return 'black';
        },

        repoEnabled: function(itemURL) {
            let meta = this.findMeta(itemURL);
            if (meta) {
                return meta.visible;
            }

            return false;
        },
        toggleRepo: function(type, i) {
            if (type === 'gh') {
                this.github_repos[i].visible = !this.github_repos[i].visible;
            } else {
                this.enterprise_repos[i].visible = !this.enterprise_repos[i].visible;
            }
        },
        toggleProject: function(i) {
            this.projects[i].visible = !this.projects[i].visible;
        },
        toggleMilestone: function(i) {
            this.milestones[i].visible = !this.milestones[i].visible;
        },
        togglePullRequests: function(i) {
            this.pullrequests[i].visible = !this.pullrequests[i].visible;
        },
        hideAllItems: function() {
            for (let proj of this.projects) {
                proj.visible = false;
            }

            for (let milestone of this.milestones) {
                milestone.visible = false;
            }

            this.pullrequests.open.visible = false;
            this.pullrequests.closed.visible = false;
        },
        clearAllItems: function() {
            this.milestones = [];
            this.projects = [];
            this.pullrequests = {
                open: {
                    visible: true,
                    pullrequests: []
                },
                closed: {
                    visible: true,
                    pullrequests: []
                },
            };
            this.reviews = {};
        }
    }
});
